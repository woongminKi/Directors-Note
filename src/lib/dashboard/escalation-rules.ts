export interface StudentRegression {
	studentId: string;
	studentName: string;
	previous: "A" | "B" | "C" | "D";
	current: "A" | "B" | "C" | "D";
}

export interface EscalationInput {
	studentGradeRegressions: StudentRegression[];
	aiFailuresLast24h: number;
}

export type EscalationAlert =
	| { kind: "regression"; label: string; studentId: string }
	| { kind: "ai-failure"; label: string; count: number };

const AI_FAILURE_THRESHOLD = 5;

export function deriveEscalations(input: EscalationInput): EscalationAlert[] {
	const out: EscalationAlert[] = [];

	for (const r of input.studentGradeRegressions) {
		out.push({
			kind: "regression",
			studentId: r.studentId,
			label: `${r.studentName} 등급 후퇴 (${r.previous}→${r.current})`,
		});
	}

	if (input.aiFailuresLast24h > AI_FAILURE_THRESHOLD) {
		out.push({
			kind: "ai-failure",
			count: input.aiFailuresLast24h,
			label: `AI 호출 실패 ${input.aiFailuresLast24h}건 (24시간)`,
		});
	}

	return out;
}
