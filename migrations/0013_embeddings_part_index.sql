-- 0013_embeddings_part_index.sql
-- 적용 시점: 0012 이후. Reference 영상을 3파트로 분할 임베딩하는 변경.
-- 의미: 학원의 평가 영상이 3파트 구조 (자유연기 0-90s / 무용·노래 90-150s /
--   압박면접 150s~) 라는 도메인 지식에 따라, 영상당 1408d embedding 1개가
--   아닌 part 별 3개를 저장. embeddings.part_index 컬럼 추가 (1/2/3 또는 NULL).
--
--   NULL 의미: 레거시 — pre-0013 전 영상 또는 part 미분류. v1 시드는 모두 1/2/3
--   사용. evaluation embedding 도 점진적으로 part 분할 예정 (vertex.ts follow-up).
--
--   매칭 RPC 도 part 별 매칭으로 분리: search_reference_matches_by_part 신설.
--   기존 search_reference_matches 는 backward-compat 위해 유지 (모든 part 통합
--   매칭) — 학생 분석 코드 (vertex.ts) 가 part 분할로 마이그레이션 완료되면
--   제거 권장.

ALTER TABLE embeddings
  ADD COLUMN part_index smallint;

COMMENT ON COLUMN embeddings.part_index IS
  '영상 내 파트 인덱스. 1=자유연기(0-90s), 2=무용·노래(90-150s), 3=압박면접(150s~). NULL=레거시 또는 part 미분류.';

ALTER TABLE embeddings
  ADD CONSTRAINT embeddings_part_index_check
  CHECK (part_index IS NULL OR part_index IN (1, 2, 3));

-- Part-aware 매칭 RPC. p_part_index 로 같은 part 끼리만 cosine 비교.
CREATE OR REPLACE FUNCTION search_reference_matches_by_part(
  p_query_vector vector(1408),
  p_academy_id uuid,
  p_part_index smallint,
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
    AND e.part_index = p_part_index
  ORDER BY e.vector <=> p_query_vector ASC
  LIMIT p_limit
$$;

COMMENT ON FUNCTION search_reference_matches_by_part IS
  'Part-aware cosine 매칭. 학생 영상의 part N 임베딩 → 같은 academy reference_videos 의 part N 임베딩 중 top-K. SECURITY DEFINER + p_academy_id 명시 격리.';

REVOKE ALL ON FUNCTION search_reference_matches_by_part FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_reference_matches_by_part TO service_role;
