-- 0020_payment_orders.sql
-- 적용 시점: 0019 이후. D-③ 소비자 결제(카카오페이) 주문/거래.
-- Source: docs/superpowers/specs/2026-06-05-consumer-payment-kakaopay-design.md
-- paid_at(unlock 신호)는 submissions 에 유지. 금액/거래 상세는 여기에.
-- 관례: 0014 따름.

BEGIN;

CREATE TABLE payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount integer NOT NULL,
  provider text NOT NULL CHECK (provider IN ('kakaopay','stub')),
  provider_tid text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','approved','canceled','failed')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_orders_submission ON payment_orders(submission_id);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);

COMMIT;
