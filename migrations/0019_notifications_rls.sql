-- 0019_notifications_rls.sql
-- 적용 시점: 0018 이후. 알림 테이블 RLS.
-- push_subscriptions: 본인 구독만 관리(authenticated). 발송 조회는 service-role(RLS bypass).
-- notifications: 시스템(service-role) 전용 — authenticated 정책 없음(=deny). in-app 센터는 비범위.

BEGIN;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_owner_select ON push_subscriptions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY push_subscriptions_owner_insert ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY push_subscriptions_owner_update ON push_subscriptions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY push_subscriptions_owner_delete ON push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

-- notifications: RLS 켜고 정책 없음 → authenticated 전면 차단. service-role 만 접근(시스템 write/send).
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

COMMIT;
