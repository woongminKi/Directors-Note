-- 0003_students_year.sql.draft
-- 적용 시점: 0001/0002 적용 후. PIPA 변호사 별도 review 불필요 — schema 단순 컬럼 추가.
-- 적용: mv 0003_students_year.sql.draft 0003_students_year.sql && supabase db push

ALTER TABLE students ADD COLUMN year text;
COMMENT ON COLUMN students.year IS '학생 구분 — 자유 텍스트 (예: 1년차, 2년차, 재수생)';
