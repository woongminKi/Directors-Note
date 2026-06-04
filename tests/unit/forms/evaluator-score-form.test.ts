import { describe, expect, it } from "vitest";
import { evaluatorScoreFormSchema } from "@/lib/forms/evaluator-score-form";

const valid = {
	vocal: 8,
	expression: 7,
	movement: 6.5,
	examReadiness: 9,
	rationale: {
		vocal: "발음 또렷, 호흡 안정.",
		expression: "정서 진정성 있음.",
		movement: "정렬·균형 안정.",
		examReadiness: "본방 대비 80%.",
	},
	holisticGrade: "A" as const,
};

describe("evaluatorScoreFormSchema", () => {
	it("accepts a fully filled valid score", () => {
		expect(evaluatorScoreFormSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts boundary scores 0 and 10", () => {
		const r = evaluatorScoreFormSchema.safeParse({
			...valid,
			vocal: 0,
			examReadiness: 10,
		});
		expect(r.success).toBe(true);
	});

	it.each(["vocal", "expression", "movement", "examReadiness"] as const)(
		"requires the %s axis score",
		(axis) => {
			const input = { ...valid } as Record<string, unknown>;
			delete input[axis];
			const r = evaluatorScoreFormSchema.safeParse(input);
			expect(r.success).toBe(false);
			if (!r.success)
				expect(r.error.issues.some((i) => i.path.includes(axis))).toBe(true);
		},
	);

	it("rejects a score below 0", () => {
		expect(
			evaluatorScoreFormSchema.safeParse({ ...valid, vocal: -1 }).success,
		).toBe(false);
	});

	it("rejects a score above 10", () => {
		expect(
			evaluatorScoreFormSchema.safeParse({ ...valid, movement: 10.5 }).success,
		).toBe(false);
	});

	it.each(["vocal", "expression", "movement", "examReadiness"] as const)(
		"requires the %s rationale (non-empty after trim)",
		(axis) => {
			const r = evaluatorScoreFormSchema.safeParse({
				...valid,
				rationale: { ...valid.rationale, [axis]: "   " },
			});
			expect(r.success).toBe(false);
			if (!r.success)
				expect(
					r.error.issues.some(
						(i) => i.path.includes("rationale") && i.path.includes(axis),
					),
				).toBe(true);
		},
	);

	it("rejects a missing rationale object", () => {
		const { rationale, ...rest } = valid;
		void rationale;
		expect(evaluatorScoreFormSchema.safeParse(rest).success).toBe(false);
	});

	it("rejects an invalid holisticGrade", () => {
		expect(
			evaluatorScoreFormSchema.safeParse({ ...valid, holisticGrade: "E" })
				.success,
		).toBe(false);
	});

	it("requires holisticGrade", () => {
		const { holisticGrade, ...rest } = valid;
		void holisticGrade;
		expect(evaluatorScoreFormSchema.safeParse(rest).success).toBe(false);
	});
});
