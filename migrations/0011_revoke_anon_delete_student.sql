-- 0011_revoke_anon_delete_student.sql
-- 적용 시점: 0010 이후. 사전 부채 정리.
-- 의미: delete_student 는 코치 only (authenticated). 내부적으로 my_academy_id()
--   NULL 체크로 anon 호출은 거부되나, Supabase advisor (0028) 가 anon 의
--   EXECUTE 권한을 별도 lint. defense-in-depth 로 anon 권한 REVOKE.
--   기존 동작 변경 없음 — anon 은 어차피 함수 본문에서 차단됐었음.

REVOKE EXECUTE ON FUNCTION delete_student(uuid) FROM anon;
