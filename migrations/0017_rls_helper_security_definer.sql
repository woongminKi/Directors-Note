-- 0017_rls_helper_security_definer.sql
-- 적용 시점: 0016 이후. RLS 헬퍼 함수 무한 재귀 수정 (검증 발견, HIGH).
--
-- 문제: my_academy_id()(0002)·my_role()(0015) 가 SECURITY DEFINER 가 아니라
--   authenticated 로 실행됨. 내부 `SELECT ... FROM users WHERE id=auth.uid()` 가
--   users_select 정책(USING academy_id = my_academy_id())을 다시 발동 →
--   my_academy_id() 재귀 → 54001 stack depth limit exceeded.
--   영향: authenticated 클라이언트의 users/academies/students/submissions 읽기
--   전부 재귀. 기존 B2B 는 서버측 service-role(RLS bypass) 로 읽어 잠재됐고,
--   B2C 소비자/평가자 인증 클라이언트 읽기에서 드러남.
--
-- 수정: 표준 Supabase 패턴 — RLS 정책이 호출하는 헬퍼는 SECURITY DEFINER 로
--   소유자(postgres) 권한 실행 → 내부 조회가 RLS bypass → 재귀 차단.
--   둘 다 고쳐야 함(재귀가 my_academy_id 경유, my_role 내부 조회도 같은 고리).

ALTER FUNCTION my_academy_id() SECURITY DEFINER;
ALTER FUNCTION my_academy_id() SET search_path = public, extensions;  -- DEFINER 안전(search_path 고정)

ALTER FUNCTION my_role() SECURITY DEFINER;  -- search_path 는 0015 에서 이미 설정됨
