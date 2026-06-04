import { z } from "zod";

// WS5.2 — 평가자 루브릭 채점 폼 스키마.
//
// judge-rubric-v1.ts 의 JUDGE_RESPONSE_SCHEMA 와 동일한 4축 + holisticGrade 에
// 바인딩한다. 코치 불릿폼(coach-bullet-form.ts)의 "5중 2개 작성"과 달리, 평가자
// 채점은 **4축 점수·근거 전부 필수**다 (사람 라벨은 1급 학습 데이터 — 누락 불가).
//
// 점수: 0–10, step 0.5. numeric(3,1) DB CHECK(0 AND 10) 와 정합.
// 근거: 각 축 한국어 1–2문장(공백 trim 후 비어있으면 거부).
// holisticGrade: A|B|C|D (계산 등급 derived_grade 와 별개의 평가자 종합 판단).

const AXIS_SCORE = z
	.number({ message: "점수를 입력해 주세요." })
	.min(0, "0 이상이어야 합니다.")
	.max(10, "10 이하여야 합니다.");

const RATIONALE = z
	.string()
	.trim()
	.min(1, "근거를 작성해 주세요.")
	.max(300, "300자 이내로 작성해 주세요.");

export const evaluatorScoreFormSchema = z.object({
	vocal: AXIS_SCORE,
	expression: AXIS_SCORE,
	movement: AXIS_SCORE,
	examReadiness: AXIS_SCORE,
	rationale: z.object({
		vocal: RATIONALE,
		expression: RATIONALE,
		movement: RATIONALE,
		examReadiness: RATIONALE,
	}),
	holisticGrade: z.enum(["A", "B", "C", "D"], {
		message: "종합 등급을 선택해 주세요.",
	}),
});

export type EvaluatorScoreFormInput = z.infer<typeof evaluatorScoreFormSchema>;
