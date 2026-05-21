-- 0012_lock_down_delete_student.sql
-- 적용 시점: 0011 이후.
-- 의미: 0011 의 REVOKE anon 만으로는 PUBLIC grant 가 우선이라 anon EXECUTE 가
--   유지됨. PUBLIC 전체 REVOKE 후 authenticated/service_role 만 명시 GRANT.
--   기존 동작 변경 없음 — anon 호출은 함수 본문 my_academy_id() NULL 체크로
--   막혀 있었으나 advisor 깨끗하게 정리 + defense-in-depth.

REVOKE ALL ON FUNCTION delete_student(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_student(uuid) TO authenticated, service_role;
