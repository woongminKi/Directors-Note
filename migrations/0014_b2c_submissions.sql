-- 0014_b2c_submissions.sql
-- 적용 시점: 0013 이후. B2C Phase A (사람 평가 MVP) 데이터 모델.
-- Source: work-log/2026-06-04 B2C Phase A 구현 명세.md — WS1.
-- 의미: 소비자 업로드(submissions) → 평가자 배정(evaluation_assignments) →
--   루브릭 v1 4축 채점(labeled_results). 각 채점은 1급 라벨 학습 데이터.
--   AI 는 request path 에 없음 (Phase A = 사람 전용). 기존 academy/student 테이블은
--   dormant 유지 (WS1.5) — 드롭/마이그레이션 안 함. delete_student() 도 그대로.
-- 관례: 0001 따름 (uuid PK default gen_random_uuid(), timestamptz default now(),
--   inline CHECK enum, named constraint, idx_*).

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- WS1.1 — users: role 확장 + evaluator QA 필드 + academy_id nullable
-- ───────────────────────────────────────────────────────────────────────────
-- 소비자/플랫폼 평가자는 학원 소속이 없으므로 academy_id NOT NULL 제거.
ALTER TABLE users ALTER COLUMN academy_id DROP NOT NULL;

-- role CHECK 을 consumer/evaluator 포함하도록 교체.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'coach', 'admin', 'consumer', 'evaluator'));

-- 평가자 QA 컬럼 (nullable; 비-평가자는 모두 null/default).
ALTER TABLE users
  ADD COLUMN inter_rater_score numeric(4,3),
  ADD COLUMN labels_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN onboarded_at timestamptz,
  ADD COLUMN evaluator_status text
    CHECK (evaluator_status IN ('pending', 'active', 'suspended'));

COMMENT ON COLUMN users.inter_rater_score IS
  '평가자 inter-rater agreement (이중라벨 비교 피드). 0~1.';
COMMENT ON COLUMN users.onboarded_at IS
  '6영상 calibration 통과 시각. NULL = 미통과 (배정 풀 제외).';


-- ───────────────────────────────────────────────────────────────────────────
-- WS1.2 — submissions (소비자 업로드 진입; student-tied evaluations 대체)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scene_type text NOT NULL,
  performance_year text,
  video_storage_url text,                          -- 삭제 후 NULL
  video_lifecycle_expires_at timestamptz NOT NULL,
  -- 동의
  consent_artifact_url text,
  consent_version text,
  consent_recorded_at timestamptz,
  -- 연령/보호자
  is_minor boolean NOT NULL,
  age_band text NOT NULL CHECK (age_band IN ('under14', '14_18', 'adult')),
  guardian_relationship text,
  guardian_contact text,
  -- 미성년 영구 학습용 별도 옵트인 (§7.4 최고위험; 평가 동의 ≠ 학습 동의)
  training_opt_in boolean NOT NULL DEFAULT false,
  -- 상태
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'assigned', 'scored', 'released')),
  paid_at timestamptz,                             -- WS7 결제 프리미티브
  soft_deleted_at timestamptz,                     -- PIPA right-to-be-forgotten
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_submissions_uploader ON submissions(uploader_user_id);
CREATE INDEX idx_submissions_status ON submissions(status);

COMMENT ON TABLE submissions IS
  'B2C 소비자 업로드 진입점. 일별 유니크 없음 (다중 제출 허용). evaluations 와 소유 모델 다름 (데이터 이전 안 함).';
COMMENT ON COLUMN submissions.training_opt_in IS
  'is_minor 와 의도적으로 분리. 평가 동의(consent_*)와 별개의 영구 학습 코퍼스 보존 동의. §7.4 변호사 사인오프 게이트.';


-- ───────────────────────────────────────────────────────────────────────────
-- WS1.3 — evaluation_assignments (라우팅 큐)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE evaluation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  evaluator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,                     -- SLA
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'submitted', 'expired', 'reassigned')),
  is_redundant_label boolean NOT NULL DEFAULT false,  -- QA 이중라벨
  CONSTRAINT evaluation_assignments_submission_evaluator_unique
    UNIQUE (submission_id, evaluator_user_id)
);

-- 제출당 활성 primary 배정은 최대 1개 (race-safe; claim_assignment 의
-- onConflictDoNothing 와 짝지어 동작, 0005 패턴).
CREATE UNIQUE INDEX uq_active_primary_assignment
  ON evaluation_assignments(submission_id)
  WHERE status = 'assigned' AND is_redundant_label = false;

CREATE INDEX idx_assignments_evaluator_status
  ON evaluation_assignments(evaluator_user_id, status);

COMMENT ON CONSTRAINT evaluation_assignments_submission_evaluator_unique
  ON evaluation_assignments IS
  '같은 제출-평가자 쌍 중복 배정 금지. onConflictDoNothing race-safe (0005 패턴).';
COMMENT ON INDEX uq_active_primary_assignment IS
  '제출당 활성(status=assigned) 비-redundant primary 배정 1개 보장. 이중라벨(is_redundant_label=true)은 예외.';


-- ───────────────────────────────────────────────────────────────────────────
-- WS1.4 — labeled_results (1급 라벨 데이터; ai_analyses 아날로그)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE labeled_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  evaluator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- 4축 (movement 는 ai_analyses 와 달리 실컬럼)
  vocal_score numeric(3,1) NOT NULL CHECK (vocal_score BETWEEN 0 AND 10),
  expression_score numeric(3,1) NOT NULL CHECK (expression_score BETWEEN 0 AND 10),
  movement_score numeric(3,1) NOT NULL CHECK (movement_score BETWEEN 0 AND 10),
  exam_readiness_score numeric(3,1) NOT NULL CHECK (exam_readiness_score BETWEEN 0 AND 10),
  holistic_grade text NOT NULL CHECK (holistic_grade IN ('A', 'B', 'C', 'D')),
  derived_grade text NOT NULL CHECK (derived_grade IN ('A', 'B', 'C', 'D')),
  rationale jsonb NOT NULL,                         -- 4축 한국어 근거
  rubric_version text NOT NULL,                     -- = JUDGE_RUBRIC_VERSION
  source text NOT NULL DEFAULT 'human'
    CHECK (source IN ('human', 'cosine', 'llm_judge')),
  is_primary boolean NOT NULL DEFAULT false,        -- WS6 release 시 set (소비자 노출)
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 이중라벨 = 다른 평가자의 별도 행. submission 단독 유니크 금지.
  CONSTRAINT labeled_results_submission_evaluator_unique
    UNIQUE (submission_id, evaluator_user_id)
);

CREATE INDEX idx_labeled_results_submission ON labeled_results(submission_id);
CREATE INDEX idx_labeled_results_evaluator ON labeled_results(evaluator_user_id);

COMMENT ON TABLE labeled_results IS
  '1급 사람 라벨 데이터. 이중라벨 = 다른 평가자 행 (inter-rater 데이터셋). 소비자 노출은 is_primary=true (비-redundant) 라벨만.';
COMMENT ON COLUMN labeled_results.is_primary IS
  'WS6 release 전이 시 primary(비-redundant) 라벨에 true 셋. RLS 가 released+is_primary 일 때만 소비자 노출.';


COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- 검증 query (적용 후 manual sanity check)
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_role_check';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'evaluation_assignments';
-- SELECT table_name, count(*) FROM information_schema.columns
--   WHERE table_name IN ('submissions','evaluation_assignments','labeled_results')
--   GROUP BY table_name;
