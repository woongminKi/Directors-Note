-- Director's Note v1 — RLS policies (DRAFT — DO NOT RUN)
-- Status: 검토 대기. 0001_init 실행 후에만 실행.
-- D5 (eng-review): RLS on every multi-tenant table
-- D9 (eng-review): academy_id 비정규화 → 정책 단일레벨

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Helper function — 본인 academy_id 단축 조회
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_academy_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT academy_id FROM users WHERE id = auth.uid() LIMIT 1
$$;

COMMENT ON FUNCTION my_academy_id() IS
  'auth.uid() 의 academy_id 반환. v1 은 user 1개 학원 가정. multi-academy user 지원 시 set 반환으로 변경.';


-- ───────────────────────────────────────────────────────────────────────────
-- ENABLE RLS on every multi-tenant table
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE academies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_videos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_drafts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings        ENABLE ROW LEVEL SECURITY;


-- ───────────────────────────────────────────────────────────────────────────
-- academies — 본인 소속 학원만 SELECT, owner 만 UPDATE
-- ───────────────────────────────────────────────────────────────────────────
CREATE POLICY academies_select ON academies
  FOR SELECT USING (id = my_academy_id());

CREATE POLICY academies_update ON academies
  FOR UPDATE USING (
    id = my_academy_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner')
  );


-- ───────────────────────────────────────────────────────────────────────────
-- users — 본인 학원의 user 만 (admin/owner 는 invite/manage)
-- ───────────────────────────────────────────────────────────────────────────
CREATE POLICY users_select ON users
  FOR SELECT USING (academy_id = my_academy_id());

CREATE POLICY users_insert ON users
  FOR INSERT WITH CHECK (
    academy_id = my_academy_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY users_update ON users
  FOR UPDATE USING (
    academy_id = my_academy_id()
    AND (id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin')))
  );


-- ───────────────────────────────────────────────────────────────────────────
-- students — 본인 학원만 + soft-deleted 제외 (RLS 단계 익명화 강제)
-- ───────────────────────────────────────────────────────────────────────────
CREATE POLICY students_select ON students
  FOR SELECT USING (academy_id = my_academy_id() AND soft_deleted_at IS NULL);

CREATE POLICY students_insert ON students
  FOR INSERT WITH CHECK (academy_id = my_academy_id());

CREATE POLICY students_update ON students
  FOR UPDATE USING (academy_id = my_academy_id());
-- NOTE: hard DELETE 불허. PIPA right-to-be-forgotten 은 delete_student() RPC 통해 soft-delete.


-- ───────────────────────────────────────────────────────────────────────────
-- reference_videos — 본인 학원만
-- ───────────────────────────────────────────────────────────────────────────
CREATE POLICY ref_videos_select ON reference_videos
  FOR SELECT USING (academy_id = my_academy_id());

CREATE POLICY ref_videos_insert ON reference_videos
  FOR INSERT WITH CHECK (
    academy_id = my_academy_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY ref_videos_delete ON reference_videos
  FOR DELETE USING (
    academy_id = my_academy_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );


-- ───────────────────────────────────────────────────────────────────────────
-- evaluations — 본인 학원만 + 코치는 본인이 evaluate 한 것 + owner/admin 은 모두
-- ───────────────────────────────────────────────────────────────────────────
CREATE POLICY eval_select ON evaluations
  FOR SELECT USING (academy_id = my_academy_id());

CREATE POLICY eval_insert ON evaluations
  FOR INSERT WITH CHECK (
    academy_id = my_academy_id()
    AND coach_user_id = auth.uid()
    -- application invariant: parent_consent_on_file_at IS NOT NULL 인 student 만
  );

CREATE POLICY eval_update ON evaluations
  FOR UPDATE USING (
    academy_id = my_academy_id()
    AND (
      coach_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
    )
  );


-- ───────────────────────────────────────────────────────────────────────────
-- ai_analyses — 본인 학원만 (D9 비정규화로 단일레벨 쿼리)
-- ───────────────────────────────────────────────────────────────────────────
CREATE POLICY ai_select ON ai_analyses
  FOR SELECT USING (academy_id = my_academy_id());

CREATE POLICY ai_insert ON ai_analyses
  FOR INSERT WITH CHECK (academy_id = my_academy_id());
-- NOTE: AI grade 는 코치 only. 부모 surface 는 RLS bypass RPC 가 ai_analyses 절대 SELECT 안 함 (P2 hold).


-- ───────────────────────────────────────────────────────────────────────────
-- feedback_drafts — 본인 학원 코치만 (부모 surface 는 별도 RPC, RLS bypass)
-- ───────────────────────────────────────────────────────────────────────────
CREATE POLICY drafts_select ON feedback_drafts
  FOR SELECT USING (academy_id = my_academy_id());

CREATE POLICY drafts_insert ON feedback_drafts
  FOR INSERT WITH CHECK (academy_id = my_academy_id());

CREATE POLICY drafts_update ON feedback_drafts
  FOR UPDATE USING (
    academy_id = my_academy_id()
    AND EXISTS (
      SELECT 1 FROM evaluations e
      WHERE e.id = feedback_drafts.evaluation_id
        AND (e.coach_user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin')))
    )
  );


-- ───────────────────────────────────────────────────────────────────────────
-- embeddings — 본인 학원만
-- ───────────────────────────────────────────────────────────────────────────
CREATE POLICY emb_select ON embeddings
  FOR SELECT USING (academy_id = my_academy_id());

CREATE POLICY emb_insert ON embeddings
  FOR INSERT WITH CHECK (academy_id = my_academy_id());

CREATE POLICY emb_delete ON embeddings
  FOR DELETE USING (
    academy_id = my_academy_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 부모 surface RPC (RLS bypass — service_role 키로만 호출)
-- ───────────────────────────────────────────────────────────────────────────
-- pepper 는 환경 설정으로:
-- SELECT set_config('app.share_link_pepper', '<32-byte-hex-pepper>', false);
-- (또는 supabase secret 으로 inject)

CREATE OR REPLACE FUNCTION get_parent_feedback(p_token text)
RETURNS TABLE(
  coach_edited_text text,
  student_name text,
  academy_name text,
  coach_email text,
  evaluation_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    fd.coach_edited_text,
    s.name,
    a.name,
    u.email,
    e.evaluation_date
  FROM feedback_drafts fd
  JOIN evaluations e ON e.id = fd.evaluation_id
  JOIN students s ON s.id = e.student_id
  JOIN academies a ON a.id = e.academy_id
  JOIN users u ON u.id = e.coach_user_id
  WHERE fd.share_link_token_hash = encode(
          digest(p_token || current_setting('app.share_link_pepper', true), 'sha256'),
          'hex'
        )
    AND fd.status = 'sent'
    AND fd.share_link_expires_at > now()
    AND s.soft_deleted_at IS NULL
$$;

COMMENT ON FUNCTION get_parent_feedback IS
  '부모 share-link 페이지 액세스. RLS bypass (SECURITY DEFINER). token + pepper sha256 매칭 + 만료/익명화 체크.';


-- ───────────────────────────────────────────────────────────────────────────
-- Right-to-be-forgotten RPC (PIPA 동의 철회 시)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_academy uuid;
  v_my_academy uuid;
BEGIN
  -- 인증 컨텍스트 검증 — auth.uid() 없으면 거부 (service_role 직접 호출 방지)
  v_my_academy := my_academy_id();
  IF v_my_academy IS NULL THEN
    RAISE EXCEPTION 'forbidden: authenticated user required';
  END IF;

  -- 본인 학원의 학생인지 확인
  SELECT academy_id INTO v_academy FROM students
  WHERE id = p_student_id AND soft_deleted_at IS NULL;

  IF v_academy IS NULL THEN
    RAISE EXCEPTION 'student not found or already deleted';
  END IF;

  IF v_academy IS DISTINCT FROM v_my_academy THEN
    RAISE EXCEPTION 'forbidden: cross-academy access';
  END IF;

  -- 1) PII 익명화
  UPDATE students SET
    soft_deleted_at = now(),
    name = 'STUDENT_DELETED_' || p_student_id::text,
    parent_consent_artifact_url = NULL
  WHERE id = p_student_id;

  -- 2) video storage URL NULL out (storage object hard delete 는 별도 worker 가 처리)
  UPDATE evaluations SET video_storage_url = NULL WHERE student_id = p_student_id;

  -- 3) embeddings 는 보존 (anonymized academy 자산)
  -- 4) feedback_drafts 는 보존 (학원 archive)
  -- 5) ai_analyses 는 보존 (academy 자산, 학생 매핑은 evaluations FK 통해서만)
END;
$$;

COMMENT ON FUNCTION delete_student IS
  'PIPA right-to-be-forgotten. 본인 학원 학생만. PII 익명화 + video URL nullify. embeddings/drafts/analyses 는 anonymized 보존.';


COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- 검증 query
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
