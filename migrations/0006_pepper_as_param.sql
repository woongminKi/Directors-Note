-- 0006_pepper_as_param.sql
-- 적용 시점: 0002 RLS 의 get_parent_feedback() 후속 fix.
-- 의미: pepper 를 함수 caller 가 인자로 전달하도록 변경.
--   0002 의 current_setting('app.share_link_pepper') 방식은 Supabase 가 'app.*'
--   네임스페이스 GUC SET 을 platform-level 로 막아둬서 어떤 권한으로도 셋팅
--   불가 (ERROR 42501). ALTER DATABASE / ALTER FUNCTION / ALTER ROLE 모두 거부됨.
--
--   pepper 는 어차피 Next.js 서버가 발송 시 sha256(token+pepper) 만들 때 이미
--   들고 있는 값 (env SHARE_LINK_PEPPER). 부모 페이지 RPC 호출 시 같은 service-
--   role 핸들러에서 한 번 더 넘기는 것 = trust boundary 동일, 보안 손실 없음.
--   향후 prod cutover 시 Supabase Vault (vault.decrypted_secrets) 로 옮기는
--   걸 권장 (audit log + rotation 용이).

DROP FUNCTION IF EXISTS get_parent_feedback(text);

CREATE OR REPLACE FUNCTION get_parent_feedback(p_token text, p_pepper text)
RETURNS TABLE(
  coach_edited_text text,
  student_name text,
  academy_name text,
  coach_email text,
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
    u.email,
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
  '부모 share-link 페이지 액세스. RLS bypass (SECURITY DEFINER). pepper 는 caller (Next.js service-role 핸들러) 가 env SHARE_LINK_PEPPER 를 전달. 0002 의 current_setting() 방식은 Supabase platform 제약으로 불가.';
