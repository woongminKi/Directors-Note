-- 0005_evaluations_unique_per_day.sql
-- 적용 시점: 0004 이후. T14 review follow-up.
-- 의미: 같은 학생에 대해 같은 날짜로 evaluation row 가 두 개 생기는 race condition 방지.
--   start-action.ts 가 findFirst + insert 사이의 race window 로 dup row 만들 수 있음.
--   .onConflictDoNothing() 와 짝지어 race-safe 하게 작동.

ALTER TABLE evaluations
  ADD CONSTRAINT evaluations_student_date_unique
  UNIQUE (student_id, evaluation_date);

COMMENT ON CONSTRAINT evaluations_student_date_unique
  ON evaluations IS
  'T14 race-safe: 같은 학생/같은 날짜 evaluation row 는 최대 1개. start-action 의 onConflictDoNothing 와 함께 동작.';
