-- 0008_get_parent_feedback_display_name.sql
-- 적용 시점: 0006 + 0007 이후.
-- 의미: RPC 가 코치 이메일 대신 display_name 을 반환하도록 변경. 부모 surface
--   에서 PII 노출 차단. display_name NULL 이면 '담당 선생님' fallback.

DROP FUNCTION IF EXISTS get_parent_feedback(text, text);

CREATE OR REPLACE FUNCTION get_parent_feedback(p_token text, p_pepper text)
RETURNS TABLE(
  coach_edited_text text,
  student_name text,
  academy_name text,
  coach_display_name text,
  evaluation_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    fd.coach_edited_text,
    s.name,
    a.name,
    coalesce(u.display_name, '담당 선생님'),
    e.evaluation_date
  FROM feedback_drafts fd
  JOIN evaluations e ON e.id = fd.evaluation_id
  JOIN students s ON s.id = e.student_id
  JOIN academies a ON a.id = e.academy_id
  JOIN users u ON u.id = e.coach_user_id
  WHERE fd.share_link_token_hash = encode(
          digest(p_token || p_pepper, 'sha256'),
          'hex'
        )
    AND fd.status = 'sent'
    AND fd.share_link_expires_at > now()
    AND s.soft_deleted_at IS NULL
$$;

COMMENT ON FUNCTION get_parent_feedback IS
  '부모 share-link 페이지 액세스. RLS bypass (SECURITY DEFINER). pepper 는 caller 가 env SHARE_LINK_PEPPER 전달. 코치 식별은 display_name 기반 (NULL 시 ''담당 선생님''), 이메일 노출 X (0008).';
