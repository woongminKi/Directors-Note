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
