-- 0024_evaluator_earnings_rls.sql
-- 적용 시점: 0023 이후. 정산 원장 RLS. 평가자 본인 적립만 SELECT. write 는 시스템.

BEGIN;

ALTER TABLE evaluator_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY evaluator_earnings_owner_select ON evaluator_earnings
  FOR SELECT USING (evaluator_user_id = auth.uid());

COMMIT;
