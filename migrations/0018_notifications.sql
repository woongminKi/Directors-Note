-- 0018_notifications.sql
-- 적용 시점: 0017 이후. D-② 알림 (공통토대 + 웹푸시).
-- Source: docs/superpowers/specs/2026-06-05-notifications-webpush-pwa-design.md
-- push_subscriptions: 사용자 웹푸시 구독. notifications: 발송 아웃박스.
-- 관례: 0014 따름 (uuid PK default gen_random_uuid(), timestamptz default now(),
--   inline CHECK enum, named constraint, idx_*).

BEGIN;

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('submission_released','evaluator_assigned','submission_scored')),
  channel text NOT NULL CHECK (channel IN ('web_push','alimtalk')),
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX idx_notifications_status ON notifications(status);

COMMIT;
