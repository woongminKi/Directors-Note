-- 0021_payment_orders_rls.sql
-- 적용 시점: 0020 이후. payment_orders RLS.
-- 본인 주문만 SELECT(authenticated). write 는 시스템(service-role/직결 db, RLS bypass).

BEGIN;

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_orders_owner_select ON payment_orders
  FOR SELECT USING (user_id = auth.uid());

COMMIT;
