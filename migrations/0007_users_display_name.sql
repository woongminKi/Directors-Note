-- 0007_users_display_name.sql
-- 적용 시점: 0006 이후. A3 dogfooding 발견.
-- 의미: 부모 share-link 카드의 "작성" 라벨을 코치 이메일이 아닌 사람이 읽을
--   수 있는 이름으로 표시하기 위한 nullable 컬럼. 카카오 OAuth 시
--   user_metadata.name 을 callback 핸들러가 자동 backfill.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN users.display_name IS
  '부모 share-link 등 외부 surface 에 노출할 사용자 표시명. NULL 이면 callback 핸들러가 다음 로그인 시 auth.users.raw_user_meta_data->name 으로 채움. RPC 는 coalesce(display_name, ''담당 선생님'') 으로 fallback.';
