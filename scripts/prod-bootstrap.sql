-- ─── Director's Note — Production Bootstrap SQL ───────────────────────────
-- Generated: 2026-05-28. Source: migrations/0001 → 0012 (concatenated).
-- Apply ONCE to a fresh prod Supabase project via SQL Editor.
-- Re-running on a populated DB is unsafe — DROP/REVOKE statements + INSERT
--   ON CONFLICT clauses mostly idempotent but not all migrations are.
-- Individual files in migrations/ remain the source of truth.


-- ─── BEGIN 0001_init.sql ──────────────────────────────────────────────
-- Director's Note v1 — Initial schema migration (DRAFT — DO NOT RUN)
-- Status: 검토 대기. PIPA 변호사 의견 받은 후 .sql.draft → .sql 로 rename 하고 실행.
-- Source: ~/.gstack/projects/directors-note/schema-v1.md
-- Generated: 2026-05-10

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Extensions
-- ───────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector (Vertex multimodalembedding 1408)


-- ───────────────────────────────────────────────────────────────────────────
-- Table: academies (멀티테넌트 root)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE academies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  billing_status text NOT NULL DEFAULT 'free_pilot'
    CHECK (billing_status IN ('free_pilot', 'paid', 'canceled', 'trial')),
  seat_count int NOT NULL DEFAULT 0 CHECK (seat_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE academies IS '연기입시학원. 멀티테넌트 root. 친구 학원이 first row.';


-- ───────────────────────────────────────────────────────────────────────────
-- Table: users (Supabase auth.users 와 1:1)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'coach', 'admin')),
  email text NOT NULL,
  kakao_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_academy ON users(academy_id);

COMMENT ON TABLE users IS 'Supabase auth.users 와 1:1 매핑. 학원 소속 + 역할.';


-- ───────────────────────────────────────────────────────────────────────────
-- Table: students (PIPA 동의 게이트, soft-delete 익명화)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  parent_consent_on_file_at timestamptz,
  parent_consent_artifact_url text,
  parent_consent_version text,
  soft_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_students_academy ON students(academy_id);
CREATE INDEX idx_students_consent
  ON students(parent_consent_on_file_at)
  WHERE soft_deleted_at IS NULL;

COMMENT ON COLUMN students.soft_deleted_at IS
  'PIPA right-to-be-forgotten — 부모 동의 철회 시 익명화 처리 마킹';


-- ───────────────────────────────────────────────────────────────────────────
-- Table: reference_videos (코치 gold-standard 시연)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE reference_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('A', 'B', 'C', 'D')),
  scene_type text NOT NULL,
  technique_tag text,
  storage_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ref_videos_academy_level ON reference_videos(academy_id, level);


-- ───────────────────────────────────────────────────────────────────────────
-- Table: evaluations (학생-월별 평가 단위)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,  -- D9 비정규화
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evaluation_date date NOT NULL,
  video_storage_url text,                    -- right-to-delete 후 NULL
  video_lifecycle_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_student_date ON evaluations(student_id, evaluation_date DESC);
CREATE INDEX idx_eval_lifecycle ON evaluations(video_lifecycle_expires_at)
  WHERE video_storage_url IS NOT NULL;
CREATE INDEX idx_eval_academy_date ON evaluations(academy_id, evaluation_date DESC);

COMMENT ON COLUMN evaluations.academy_id IS
  'D9 (eng-review) 비정규화 — RLS 단일레벨 단순화';


-- ───────────────────────────────────────────────────────────────────────────
-- Table: ai_analyses (3 axes v1, internal grade 코치 only — P2 hold)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,  -- D9
  evaluation_id uuid NOT NULL UNIQUE REFERENCES evaluations(id) ON DELETE CASCADE,
  vocal_score numeric(3,1) CHECK (vocal_score BETWEEN 0 AND 10),
  expression_score numeric(3,1) CHECK (expression_score BETWEEN 0 AND 10),
  exam_readiness_score numeric(3,1) CHECK (exam_readiness_score BETWEEN 0 AND 10),
  internal_grade text NOT NULL CHECK (internal_grade IN ('A', 'B', 'C', 'D')),
  calibration_match_score numeric(4,3) CHECK (calibration_match_score BETWEEN 0 AND 1),
  evaluator_used text NOT NULL CHECK (evaluator_used IN ('cosine', 'llm_as_judge')),
  cosine_confidence numeric(4,3),
  raw_response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_eval ON ai_analyses(evaluation_id);
CREATE INDEX idx_ai_academy ON ai_analyses(academy_id);

COMMENT ON TABLE ai_analyses IS
  'v1: 3 axes (vocal, expression, exam_readiness). diction + body_alignment 은 v2.';
COMMENT ON COLUMN ai_analyses.internal_grade IS
  '코치 only. 부모 surface 절대 노출 금지 (P2 hold).';


-- ───────────────────────────────────────────────────────────────────────────
-- Table: feedback_drafts (코치 검토/편집/발송, 부모 share-link)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE feedback_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,  -- D9
  evaluation_id uuid NOT NULL UNIQUE REFERENCES evaluations(id) ON DELETE CASCADE,
  ai_draft_text text NOT NULL,
  coach_edited_text text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent')),
  approved_at timestamptz,
  share_link_token_hash text UNIQUE,
  share_link_expires_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_drafts_eval ON feedback_drafts(evaluation_id);
CREATE INDEX idx_drafts_token_hash ON feedback_drafts(share_link_token_hash)
  WHERE share_link_token_hash IS NOT NULL;
CREATE INDEX idx_drafts_expiry ON feedback_drafts(share_link_expires_at)
  WHERE status = 'sent';

COMMENT ON COLUMN feedback_drafts.share_link_token_hash IS
  'sha256(token || pepper) — unhashed token URL 에만, DB 노출 시에도 안전';


-- ───────────────────────────────────────────────────────────────────────────
-- Table: embeddings (Vertex multimodal 1408d, polymorphic FK)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE RESTRICT,  -- D9
  source_type text NOT NULL CHECK (source_type IN ('reference_video', 'evaluation')),
  source_reference_video_id uuid REFERENCES reference_videos(id) ON DELETE CASCADE,
  source_evaluation_id uuid REFERENCES evaluations(id) ON DELETE CASCADE,
  vector vector(1408) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source_type = 'reference_video'
       AND source_reference_video_id IS NOT NULL
       AND source_evaluation_id IS NULL)
    OR (source_type = 'evaluation'
       AND source_evaluation_id IS NOT NULL
       AND source_reference_video_id IS NULL)
  )
);

CREATE INDEX idx_emb_academy_type ON embeddings(academy_id, source_type);
CREATE INDEX idx_emb_ref ON embeddings(source_reference_video_id)
  WHERE source_reference_video_id IS NOT NULL;
CREATE INDEX idx_emb_eval ON embeddings(source_evaluation_id)
  WHERE source_evaluation_id IS NOT NULL;

-- pgvector HNSW index: 미설치 (D9 closing — 시퀀셜 스캔이 ≤20 reference 에서 더 빠름)
-- v2 multi-academy 진입 시 추가:
-- CREATE INDEX idx_emb_vector ON embeddings USING hnsw (vector vector_cosine_ops);

COMMENT ON TABLE embeddings IS
  'Vertex multimodalembedding@001 캐시. 1408d. references 는 1회 생성 후 영구 캐시.';


-- ───────────────────────────────────────────────────────────────────────────
-- Updated_at triggers (pgcrypto 활용 안 함, 단순)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_academies_updated BEFORE UPDATE ON academies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_evaluations_updated BEFORE UPDATE ON evaluations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_drafts_updated BEFORE UPDATE ON feedback_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- 검증 query (실행 후 manual sanity check)
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT table_name, count(*) AS columns
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('academies','users','students','reference_videos',
--                        'evaluations','ai_analyses','feedback_drafts','embeddings')
--   GROUP BY table_name ORDER BY table_name;

-- ─── END 0001_init.sql ────────────────────────────────────────────────

-- ─── BEGIN 0002_rls.sql ──────────────────────────────────────────────
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

-- ─── END 0002_rls.sql ────────────────────────────────────────────────

-- ─── BEGIN 0003_students_year.sql ──────────────────────────────────────────────
-- 0003_students_year.sql.draft
-- 적용 시점: 0001/0002 적용 후. PIPA 변호사 별도 review 불필요 — schema 단순 컬럼 추가.
-- 적용: mv 0003_students_year.sql.draft 0003_students_year.sql && supabase db push

ALTER TABLE students ADD COLUMN year text;
COMMENT ON COLUMN students.year IS '학생 구분 — 자유 텍스트 (예: 1년차, 2년차, 재수생)';

-- ─── END 0003_students_year.sql ────────────────────────────────────────────────

-- ─── BEGIN 0004_feedback_drafts_sent_check.sql ──────────────────────────────────────────────
-- 0004_feedback_drafts_sent_check.sql
-- 적용 시점: 0003 이후. F7 followup hardening.
-- 의미: status='sent' 이면 반드시 sent_at IS NOT NULL. dashboard 가
-- runtime 으로 null sent_at 행을 console.warn 후 필터하지만 (F7),
-- 데이터 레벨에서 invariant 를 강제해 long-term 일관성 보장.

ALTER TABLE feedback_drafts
  ADD CONSTRAINT feedback_drafts_sent_at_consistency
  CHECK (status <> 'sent' OR sent_at IS NOT NULL);

COMMENT ON CONSTRAINT feedback_drafts_sent_at_consistency
  ON feedback_drafts IS
  'F7 invariant: status=sent 인 행은 sent_at 이 반드시 채워져 있어야 함.';

-- ─── END 0004_feedback_drafts_sent_check.sql ────────────────────────────────────────────────

-- ─── BEGIN 0005_evaluations_unique_per_day.sql ──────────────────────────────────────────────
-- 0005_evaluations_unique_per_day.sql
-- 적용 시점: 0004 이후. T14 review follow-up.
-- 의미: 같은 학생에 대해 같은 날짜로 evaluation row 가 두 개 생기는 race condition 방지.
--   start-action.ts 가 findFirst + insert 사이의 race window 로 dup row 만들 수 있음.
--   .onConflictDoNothing() 와 짝지어 race-safe 하게 작동.

ALTER TABLE evaluations
  ADD CONSTRAINT evaluations_student_date_unique
  UNIQUE (student_id, evaluation_date);

COMMENT ON CONSTRAINT evaluations_student_date_unique
  ON evaluations IS
  'T14 race-safe: 같은 학생/같은 날짜 evaluation row 는 최대 1개. start-action 의 onConflictDoNothing 와 함께 동작.';

-- ─── END 0005_evaluations_unique_per_day.sql ────────────────────────────────────────────────

-- ─── BEGIN 0006_pepper_as_param.sql ──────────────────────────────────────────────
-- 0006_pepper_as_param.sql
-- 적용 시점: 0002 RLS 의 get_parent_feedback() 후속 fix.
-- 의미: pepper 를 함수 caller 가 인자로 전달하도록 변경.
--   0002 의 current_setting('app.share_link_pepper') 방식은 Supabase 가 'app.*'
--   네임스페이스 GUC SET 을 platform-level 로 막아둬서 어떤 권한으로도 셋팅
--   불가 (ERROR 42501). ALTER DATABASE / ALTER FUNCTION / ALTER ROLE 모두 거부됨.
--
--   pepper 는 어차피 Next.js 서버가 발송 시 sha256(token+pepper) 만들 때 이미
--   들고 있는 값 (env SHARE_LINK_PEPPER). 부모 페이지 RPC 호출 시 같은 service-
--   role 핸들러에서 한 번 더 넘기는 것 = trust boundary 동일, 보안 손실 없음.
--   향후 prod cutover 시 Supabase Vault (vault.decrypted_secrets) 로 옮기는
--   걸 권장 (audit log + rotation 용이).

DROP FUNCTION IF EXISTS get_parent_feedback(text);

CREATE OR REPLACE FUNCTION get_parent_feedback(p_token text, p_pepper text)
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
          digest(p_token || p_pepper, 'sha256'),
          'hex'
        )
    AND fd.status = 'sent'
    AND fd.share_link_expires_at > now()
    AND s.soft_deleted_at IS NULL
$$;

COMMENT ON FUNCTION get_parent_feedback IS
  '부모 share-link 페이지 액세스. RLS bypass (SECURITY DEFINER). pepper 는 caller (Next.js service-role 핸들러) 가 env SHARE_LINK_PEPPER 를 전달. 0002 의 current_setting() 방식은 Supabase platform 제약으로 불가.';

-- ─── END 0006_pepper_as_param.sql ────────────────────────────────────────────────

-- ─── BEGIN 0007_users_display_name.sql ──────────────────────────────────────────────
-- 0007_users_display_name.sql
-- 적용 시점: 0006 이후. A3 dogfooding 발견.
-- 의미: 부모 share-link 카드의 "작성" 라벨을 코치 이메일이 아닌 사람이 읽을
--   수 있는 이름으로 표시하기 위한 nullable 컬럼. 카카오 OAuth 시
--   user_metadata.name 을 callback 핸들러가 자동 backfill.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN users.display_name IS
  '부모 share-link 등 외부 surface 에 노출할 사용자 표시명. NULL 이면 callback 핸들러가 다음 로그인 시 auth.users.raw_user_meta_data->name 으로 채움. RPC 는 coalesce(display_name, ''담당 선생님'') 으로 fallback.';

-- ─── END 0007_users_display_name.sql ────────────────────────────────────────────────

-- ─── BEGIN 0008_get_parent_feedback_display_name.sql ──────────────────────────────────────────────
-- 0008_get_parent_feedback_display_name.sql
-- 적용 시점: 0006 + 0007 이후.
-- 의미: RPC 가 코치 이메일 대신 display_name 을 반환하도록 변경. 부모 surface
--   에서 PII 노출 차단. display_name NULL 이면 '담당 선생님' fallback.

DROP FUNCTION IF EXISTS get_parent_feedback(text, text);

CREATE OR REPLACE FUNCTION get_parent_feedback(p_token text, p_pepper text)
RETURNS TABLE(
  coach_edited_text text,
  student_name text,
  academy_name text,
  coach_display_name text,
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
    coalesce(u.display_name, '담당 선생님'),
    e.evaluation_date
  FROM feedback_drafts fd
  JOIN evaluations e ON e.id = fd.evaluation_id
  JOIN students s ON s.id = e.student_id
  JOIN academies a ON a.id = e.academy_id
  JOIN users u ON u.id = e.coach_user_id
  WHERE fd.share_link_token_hash = encode(
          digest(p_token || p_pepper, 'sha256'),
          'hex'
        )
    AND fd.status = 'sent'
    AND fd.share_link_expires_at > now()
    AND s.soft_deleted_at IS NULL
$$;

COMMENT ON FUNCTION get_parent_feedback IS
  '부모 share-link 페이지 액세스. RLS bypass (SECURITY DEFINER). pepper 는 caller 가 env SHARE_LINK_PEPPER 전달. 코치 식별은 display_name 기반 (NULL 시 ''담당 선생님''), 이메일 노출 X (0008).';

-- ─── END 0008_get_parent_feedback_display_name.sql ────────────────────────────────────────────────

-- ─── BEGIN 0009_storage_bucket_student_videos.sql ──────────────────────────────────────────────
-- 0009_storage_bucket_student_videos.sql
-- 적용 시점: D6 PIPA 게이트 제거 후 영상 분석 path 켜기 위한 첫 단계.
-- 의미: student 영상 업로드용 Supabase Storage bucket + academy_id prefix
--   기반 RLS isolation. Service-role 은 RLS bypass 라 upload-action.ts 의
--   createSignedUploadUrl 은 영향 X — RLS 는 미래의 authenticated 클라이언트
--   액세스 경로에 대한 defense-in-depth.
--
--   Path convention (upload-action.ts:23): "{academyId}/{evaluationId}.mp4"
--   → storage.foldername(name)[1] = academy_id

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-videos',
  'student-videos',
  false,  -- private; signed URL 로만 access
  524288000,  -- 500 MB 제한
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = now();

-- Academy isolation — authenticated 클라이언트는 자기 학원 폴더만
DROP POLICY IF EXISTS "student_videos_academy_isolation" ON storage.objects;
CREATE POLICY "student_videos_academy_isolation"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'student-videos'
  AND (storage.foldername(name))[1] = (
    SELECT academy_id::text FROM public.users WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'student-videos'
  AND (storage.foldername(name))[1] = (
    SELECT academy_id::text FROM public.users WHERE id = auth.uid()
  )
);

COMMENT ON POLICY "student_videos_academy_isolation" ON storage.objects IS
  'student-videos bucket academy_id 폴더 prefix isolation. service_role 은 RLS bypass — 실제 모든 쓰기는 service-role 핸들러 경유.';

-- ─── END 0009_storage_bucket_student_videos.sql ────────────────────────────────────────────────

-- ─── BEGIN 0010_cosine_search_references.sql ──────────────────────────────────────────────
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

-- ─── END 0010_cosine_search_references.sql ────────────────────────────────────────────────

-- ─── BEGIN 0011_revoke_anon_delete_student.sql ──────────────────────────────────────────────
-- 0011_revoke_anon_delete_student.sql
-- 적용 시점: 0010 이후. 사전 부채 정리.
-- 의미: delete_student 는 코치 only (authenticated). 내부적으로 my_academy_id()
--   NULL 체크로 anon 호출은 거부되나, Supabase advisor (0028) 가 anon 의
--   EXECUTE 권한을 별도 lint. defense-in-depth 로 anon 권한 REVOKE.
--   기존 동작 변경 없음 — anon 은 어차피 함수 본문에서 차단됐었음.

REVOKE EXECUTE ON FUNCTION delete_student(uuid) FROM anon;

-- ─── END 0011_revoke_anon_delete_student.sql ────────────────────────────────────────────────

-- ─── BEGIN 0012_lock_down_delete_student.sql ──────────────────────────────────────────────
-- 0012_lock_down_delete_student.sql
-- 적용 시점: 0011 이후.
-- 의미: 0011 의 REVOKE anon 만으로는 PUBLIC grant 가 우선이라 anon EXECUTE 가
--   유지됨. PUBLIC 전체 REVOKE 후 authenticated/service_role 만 명시 GRANT.
--   기존 동작 변경 없음 — anon 호출은 함수 본문 my_academy_id() NULL 체크로
--   막혀 있었으나 advisor 깨끗하게 정리 + defense-in-depth.

REVOKE ALL ON FUNCTION delete_student(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_student(uuid) TO authenticated, service_role;

-- ─── END 0012_lock_down_delete_student.sql ────────────────────────────────────────────────
