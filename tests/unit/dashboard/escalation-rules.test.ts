import { describe, expect, it } from "vitest";
import {
	type EscalationInput,
	deriveEscalations,
} from "@/lib/dashboard/escalation-rules";

const baseInput: EscalationInput = {
	studentGradeRegressions: [],
	aiFailuresLast24h: 0,
};

describe("deriveEscalations", () => {
	it("returns empty when no triggers", () => {
		expect(deriveEscalations(baseInput)).toEqual([]);
	});

	it("emits regression alert per regressed student", () => {
		const alerts = deriveEscalations({
			...baseInput,
			studentGradeRegressions: [
				{ studentId: "s1", studentName: "박지윤", previous: "B", current: "C" },
				{ studentId: "s2", studentName: "이서준", previous: "A", current: "B" },
			],
		});
		expect(alerts).toHaveLength(2);
		expect(alerts[0]?.kind).toBe("regression");
		expect(alerts[0]?.label).toContain("박지윤");
		expect(alerts[0]?.label).toContain("B→C");
	});

	it("emits ai-failure alert when > 5 in 24h", () => {
		const alerts = deriveEscalations({ ...baseInput, aiFailuresLast24h: 6 });
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.kind).toBe("ai-failure");
	});

	it("does not emit ai-failure when <= 5", () => {
		expect(deriveEscalations({ ...baseInput, aiFailuresLast24h: 5 })).toEqual([]);
	});

	it("combines multiple kinds in stable order (regression first)", () => {
		const alerts = deriveEscalations({
			studentGradeRegressions: [
				{ studentId: "s1", studentName: "박지윤", previous: "B", current: "C" },
			],
			aiFailuresLast24h: 10,
		});
		expect(alerts.map((a) => a.kind)).toEqual(["regression", "ai-failure"]);
	});
});
