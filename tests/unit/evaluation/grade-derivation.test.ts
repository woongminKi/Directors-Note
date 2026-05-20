import { describe, expect, it } from "vitest";
import {
	buildAnalysisFromMatches,
	deriveAxesFromTopMatch,
	shouldEscalateToJudge,
} from "@/lib/evaluation/grade-derivation";
import type { ReferenceMatch } from "@/lib/evaluation/types";

const mkMatch = (
	tier: "A" | "B" | "C" | "D",
	cosineScore: number,
	i = 0,
): ReferenceMatch => ({
	referenceVideoId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
	tier,
	sceneType: "classical_monologue",
	cosineScore,
});

describe("deriveAxesFromTopMatch", () => {
	it("A tier @ cosine 0.95 → ~9.4 (all axes equal)", () => {
		const axes = deriveAxesFromTopMatch(mkMatch("A", 0.95));
		// base 8.0 + (0.95-0.5)*3 = 9.35 → round to 9.4
		expect(axes.vocal).toBeCloseTo(9.4, 1);
		expect(axes.expression).toBe(axes.vocal);
		expect(axes.examReadiness).toBe(axes.vocal);
	});

	it("D tier @ cosine 0.5 → 3.5 (no jitter at neutral)", () => {
		const axes = deriveAxesFromTopMatch(mkMatch("D", 0.5));
		expect(axes.vocal).toBe(3.5);
	});

	it("clamps to [0,10] — A tier at impossible cosine 2.0 caps at 10", () => {
		const axes = deriveAxesFromTopMatch(mkMatch("A", 2.0));
		expect(axes.vocal).toBe(10);
	});

	it("clamps below 0 — D tier at cosine 0 floors at 0", () => {
		const axes = deriveAxesFromTopMatch(mkMatch("D", 0));
		expect(axes.vocal).toBe(2);
	});
});

describe("shouldEscalateToJudge", () => {
	it("escalates when top1 < 0.70", () => {
		expect(
			shouldEscalateToJudge([mkMatch("B", 0.65), mkMatch("C", 0.55)]),
		).toBe(true);
	});

	it("escalates when gap top1-top2 < 0.05 (ambiguous)", () => {
		expect(
			shouldEscalateToJudge([mkMatch("A", 0.85), mkMatch("B", 0.84)]),
		).toBe(true);
	});

	it("does not escalate when top1 strong + gap wide", () => {
		expect(
			shouldEscalateToJudge([mkMatch("A", 0.92), mkMatch("B", 0.75)]),
		).toBe(false);
	});

	it("escalates on empty matches (top1 defaults to 0)", () => {
		expect(shouldEscalateToJudge([])).toBe(true);
	});
});

describe("buildAnalysisFromMatches", () => {
	it("top tier becomes internal_grade; calibration_match_score = top cosine", () => {
		const matches = [
			mkMatch("A", 0.91, 1),
			mkMatch("B", 0.78, 2),
			mkMatch("C", 0.62, 3),
		];
		const analysis = buildAnalysisFromMatches(matches, { test: true });
		expect(analysis.internalGrade).toBe("A");
		expect(analysis.calibrationMatchScore).toBe(0.91);
		expect(analysis.cosineConfidence).toBe(0.91);
		expect(analysis.evaluatorUsed).toBe("cosine");
		expect(analysis.topMatches).toHaveLength(3);
	});

	it("caps topMatches at 5", () => {
		const matches = Array.from({ length: 8 }, (_, i) =>
			mkMatch("B", 0.9 - i * 0.05, i),
		);
		const analysis = buildAnalysisFromMatches(matches, {});
		expect(analysis.topMatches).toHaveLength(5);
	});

	it("throws on empty matches (academy with no reference set)", () => {
		expect(() => buildAnalysisFromMatches([], {})).toThrow(/no_reference_matches/);
	});
});
