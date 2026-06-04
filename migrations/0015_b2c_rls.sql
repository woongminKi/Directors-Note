-- 0015_b2c_rls.sql
-- 적용 시점: 0014 이후. B2C Phase A RLS (WS2). 0002 패턴 일반화.
-- Source: work-log/2026-06-04 B2C Phase A 구현 명세.md — WS2.
-- 의미: 0002 의 단일 축(my_academy_id())을 3 가시성 클래스(consumer/evaluator/
--   training)로 일반화. labeled_results 의 평가자 독립성(2.4)이 핵심 신규 RLS.
--   delete_uploader() 는 delete_student() (0002:218) 모델 — 신규(대체 아님).

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- WS2.1 — 헬퍼
-- ───────────────────────────────────────────────────────────────────────────
-- 현재 사용자 role (users 에서). my_academy_id() (0002) 와 동일 패턴.
CREATE OR REPLACE FUNCTION my_role()
RETURNS text
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT role FROM users WHERE id = auth.uid() LIMIT 1
$$;

COMMENT ON FUNCTION my_role() IS
  'auth.uid() 의 role 반환. B2C 3 가시성 클래스(consumer/evaluator) 정책에 사용.';

-- 학습 코퍼스 read 권한 방어선. 0006 제약(app.* GUC 금지)에 따라 set_config 대신
-- Supabase 가 주입하는 JWT role claim 을 검사. 실제 코퍼스 read 는 service-role
-- 핸들러 경유 (service_role 은 RLS bypass) — is_training_role() 은 defense-in-depth.
CREATE OR REPLACE FUNCTION is_training_role()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role'
$$;

COMMENT ON FUNCTION is_training_role() IS
  '학습 코퍼스 가시성 방어선. JWT role claim = service_role 검사 (0006: app.* GUC 금지이므로 set_config 미사용). 코퍼스 read 는 service-role 핸들러가 RLS bypass 로 수행, 이 함수는 authenticated 경로의 defense-in-depth.';


-- ───────────────────────────────────────────────────────────────────────────
-- ENABLE RLS
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE submissions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE labeled_results         ENABLE ROW LEVEL SECURITY;


-- ───────────────────────────────────────────────────────────────────────────
-- WS2.2 — submissions
-- ───────────────────────────────────────────────────────────────────────────
-- 소비자: 본인 제출만 SELECT (soft-deleted 제외).
CREATE POLICY submissions_consumer_select ON submissions
  FOR SELECT USING (
    uploader_user_id = auth.uid()
    AND soft_deleted_at IS NULL
  );

-- 소비자: 본인 명의 + role=consumer 로만 INSERT.
CREATE POLICY submissions_consumer_insert ON submissions
  FOR INSERT WITH CHECK (
    uploader_user_id = auth.uid()
    AND my_role() = 'consumer'
  );
-- NOTE: status 전이(queued→assigned→scored→released)는 service-role 핸들러 전담.
--   소비자 UPDATE 정책 없음 (큐 취소도 v1 은 service-role 경유).

-- 평가자: 본인에게 활성 배정된 제출만 SELECT (배정 중에만 영상 접근).
CREATE POLICY submissions_evaluator_select ON submissions
  FOR SELECT USING (
    my_role() = 'evaluator'
    AND EXISTS (
      SELECT 1 FROM evaluation_assignments ea
      WHERE ea.submission_id = submissions.id
        AND ea.evaluator_user_id = auth.uid()
        AND ea.status = 'assigned'
    )
  );

-- training (코퍼스): 전체 SELECT (service-role 방어선).
CREATE POLICY submissions_training_select ON submissions
  FOR SELECT USING (is_training_role());


-- ───────────────────────────────────────────────────────────────────────────
-- WS2.3 — evaluation_assignments
-- ───────────────────────────────────────────────────────────────────────────
-- 평가자: 본인 배정만 SELECT.
CREATE POLICY assignments_evaluator_select ON evaluation_assignments
  FOR SELECT USING (evaluator_user_id = auth.uid());

-- 평가자: 본인 배정만 UPDATE, 그리고 status='submitted' 로만 (채점 제출).
CREATE POLICY assignments_evaluator_update ON evaluation_assignments
  FOR UPDATE USING (evaluator_user_id = auth.uid())
  WITH CHECK (
    evaluator_user_id = auth.uid()
    AND status = 'submitted'
  );
-- NOTE: insert/reassign/expire 는 service-role 핸들러(라우팅) 전담. 소비자 접근 없음.


-- ───────────────────────────────────────────────────────────────────────────
-- WS2.4 — labeled_results — 평가자 독립성 (핵심 신규 RLS)
-- ───────────────────────────────────────────────────────────────────────────
-- 평가자 INSERT: 본인 명의 + 본인의 활성 배정 존재.
CREATE POLICY labeled_results_evaluator_insert ON labeled_results
  FOR INSERT WITH CHECK (
    evaluator_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM evaluation_assignments ea
      WHERE ea.submission_id = labeled_results.submission_id
        AND ea.evaluator_user_id = auth.uid()
        AND ea.status = 'assigned'
    )
  );

-- 평가자 SELECT: 본인 라벨만. 이 단일 술어가 rater-independence 보장 —
-- 제출 순서 무관, 같은 제출의 타 평가자 라벨은 절대 SELECT 불가.
CREATE POLICY labeled_results_evaluator_select ON labeled_results
  FOR SELECT USING (evaluator_user_id = auth.uid());

-- 소비자 SELECT: 본인 제출이 released 상태일 때 primary 라벨만.
CREATE POLICY labeled_results_consumer_select ON labeled_results
  FOR SELECT USING (
    is_primary = true
    AND EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.id = labeled_results.submission_id
        AND s.uploader_user_id = auth.uid()
        AND s.status = 'released'
    )
  );

-- training (코퍼스): 전체 SELECT (이중라벨 포함 = inter-rater 데이터셋).
CREATE POLICY labeled_results_training_select ON labeled_results
  FOR SELECT USING (is_training_role());


-- ───────────────────────────────────────────────────────────────────────────
-- WS2.5 — delete_uploader() RPC (right-to-be-forgotten; delete_student 0002:218 모델)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_uploader(p_uploader_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid;
  v_is_service boolean;
BEGIN
  v_caller := auth.uid();
  v_is_service := is_training_role();  -- service_role JWT claim

  -- 인증 컨텍스트 검증 — auth.uid() 도 service-role 도 아니면 거부.
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'forbidden: authenticated user or service role required';
  END IF;

  -- 가드: 대상 = 본인(auth.uid()) 또는 service-role.
  IF NOT v_is_service AND v_caller IS DISTINCT FROM p_uploader_id THEN
    RAISE EXCEPTION 'forbidden: can only delete own uploader record';
  END IF;

  -- 1) users PII 익명화.
  UPDATE users SET
    email = 'UPLOADER_DELETED_' || p_uploader_id::text,
    kakao_id = NULL,
    display_name = NULL
  WHERE id = p_uploader_id;

  -- 2) submissions: video/consent NULL out + soft-delete 마킹.
  --    (storage object hard delete 는 별도 worker 가 처리, delete_student 와 동일.)
  UPDATE submissions SET
    soft_deleted_at = now(),
    video_storage_url = NULL,
    consent_artifact_url = NULL,
    guardian_contact = NULL
  WHERE uploader_user_id = p_uploader_id;

  -- 3) 조건부 코퍼스 보존 (§7.4 — 변호사 사인오프 BLOCK; 분기는 설계, 정책은 파라미터).
  --    training_opt_in=true 인 제출의 라벨만 익명 보존(코퍼스 자산), 나머지는 삭제.
  DELETE FROM labeled_results lr
  USING submissions s
  WHERE lr.submission_id = s.id
    AND s.uploader_user_id = p_uploader_id
    AND s.training_opt_in = false;
  -- training_opt_in=true → labeled_results 보존 (uploader PII 는 1)에서 익명화됨,
  --   submission 의 video/consent 는 2)에서 NULL out → 익명 라벨만 코퍼스에 잔존).
END;
$$;

COMMENT ON FUNCTION delete_uploader IS
  'B2C right-to-be-forgotten. 본인 또는 service-role 만. users PII 익명화 + submissions video/consent NULL + soft-delete. labeled_results 는 training_opt_in=true 일 때만 익명 보존, 아니면 삭제 (§7.4 변호사 사인오프 게이트 — 정책 파라미터).';


-- ───────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER 함수 grant 잠금 (0011/0012 패턴)
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION delete_uploader(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_uploader(uuid) TO authenticated, service_role;


COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- 검증 query
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname='public' AND tablename IN ('submissions','evaluation_assignments','labeled_results');
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('submissions','evaluation_assignments','labeled_results')
--   ORDER BY tablename, policyname;
