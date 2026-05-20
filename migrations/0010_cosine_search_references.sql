-- 0010_cosine_search_references.sql
-- 적용 시점: 0009 이후. Vertex multimodal embedding 코드 활성화 직전.
-- 의미: VertexVideoAnalysisService 가 호출하는 pgvector cosine search RPC.
--   학생 영상의 1408d embedding 을 받아 같은 academy 의 reference_videos
--   중 cosine 유사도 top-K 매칭을 반환. SECURITY DEFINER 라 RLS bypass —
--   대신 p_academy_id argument 로 explicit 격리 (caller 가 service-role 이라
--   academy 신원은 application 레벨에서 검증됨).
--
--   pgvector `<=>` 는 cosine distance (0=identical, 2=opposite).
--   cosine similarity 로 변환: 1 - distance.
--   현재 ≤20 reference 가정 — HNSW 인덱스 미적용 (0001 주석 참조).

CREATE OR REPLACE FUNCTION search_reference_matches(
  p_query_vector vector(1408),
  p_academy_id uuid,
  p_limit int DEFAULT 5
)
RETURNS TABLE(
  reference_video_id uuid,
  tier text,
  scene_type text,
  cosine_similarity numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    rv.id AS reference_video_id,
    rv.level AS tier,
    rv.scene_type,
    (1 - (e.vector <=> p_query_vector))::numeric AS cosine_similarity
  FROM embeddings e
  JOIN reference_videos rv ON rv.id = e.source_reference_video_id
  WHERE e.academy_id = p_academy_id
    AND e.source_type = 'reference_video'
  ORDER BY e.vector <=> p_query_vector ASC
  LIMIT p_limit
$$;

COMMENT ON FUNCTION search_reference_matches IS
  'Vertex 분석 후 학생 영상 embedding 을 academy reference_videos 와 cosine 매칭. SECURITY DEFINER + p_academy_id 명시 격리. caller=service-role 가정.';

-- Service-role 만 호출 (application 레벨에서 academy 인증 후 호출).
-- authenticated 직접 호출 금지 — academy_id spoofing 방지.
REVOKE ALL ON FUNCTION search_reference_matches FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_reference_matches TO service_role;
