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
