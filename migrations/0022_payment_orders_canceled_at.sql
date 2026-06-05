-- 0022_payment_orders_canceled_at.sql
-- 적용 시점: 0021 이후. D-③(a) 환불 audit 컬럼.
-- status enum 의 'canceled' 는 0020 에 이미 존재. 환불 시각만 추가.

BEGIN;

ALTER TABLE payment_orders ADD COLUMN canceled_at timestamptz;

COMMIT;
