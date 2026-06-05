-- 0023_evaluator_earnings.sql
-- 적용 시점: 0022 이후. D-③(b) 정산 원장(적립). 지급(c)은 별도.
-- Source: docs/superpowers/specs/2026-06-06-settlement-ledger-design.md
-- release 시 primary 평가자에게 적립(pending), 환불 시 void. UNIQUE 로 멱등.

BEGIN;

CREATE TABLE evaluator_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  payment_order_id uuid REFERENCES payment_orders(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','void','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  CONSTRAINT evaluator_earnings_submission_evaluator_unique UNIQUE (submission_id, evaluator_user_id)
);
CREATE INDEX idx_evaluator_earnings_evaluator_status ON evaluator_earnings(evaluator_user_id, status);

COMMIT;
