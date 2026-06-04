import { describe, expect, it } from "vitest";
import {
	buildAnalysisFromPartMatches,
	deriveAxesFromPartMatches,
	deriveGradeFromScores,
	type PartMatchesByPart,
	scorePartFromTopMatch,
	shouldEscalateToJudge,
} from "@/lib/evaluation/grade-derivation";
import type { PartIndex, ReferenceMatch } from "@/lib/evaluation/types";

const mkMatch = (
	tier: "A" | "B" | "C" | "D",
	cosineScore: number,
	partIndex?: PartIndex,
	i = 0,
): ReferenceMatch => ({
	referenceVideoId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
	tier,
	sceneType: "modern_monologue",
	cosineScore,
	partIndex,
});

const mkPartMatches = (
	part1: ReferenceMatch[],
	part2: ReferenceMatch[],
	part3: ReferenceMatch[],
): PartMatchesByPart => ({ 1: part1, 2: part2, 3: part3 });

describe("scorePartFromTopMatch", () => {
	it("A tier @ cosine 0.95 → ~9.35", () => {
		// base 8.0 + (0.95-0.5)*3 = 9.35
		expect(scorePartFromTopMatch(mkMatch("A", 0.95))).toBeCloseTo(9.35, 2);
	});

	it("D tier @ neutral cosine 0.5 → 3.5", () => {
		expect(scorePartFromTopMatch(mkMatch("D", 0.5))).toBe(3.5);
	});

	it("clamps to [0, 10]", () => {
		expect(scorePartFromTopMatch(mkMatch("A", 2.0))).toBe(10);
		expect(scorePartFromTopMatch(mkMatch("D", 0))).toBe(2);
	});
});

describe("deriveGradeFromScores", () => {
	it("avg ≥ 7.25 → A", () => {
		expect(deriveGradeFromScores([8, 9, 7])).toBe("A");
	});

	it("avg ≥ 5.75 → B", () => {
		expect(deriveGradeFromScores([6, 7, 5])).toBe("B");
	});

	it("avg ≥ 4.25 → C", () => {
		expect(deriveGradeFromScores([5, 4, 5])).toBe("C");
	});

	it("else → D", () => {
		expect(deriveGradeFromScores([3, 4, 3])).toBe("D");
	});

	// WS5 — 4축(vocal/expression/movement/examReadiness) 경계.
	describe("4-axis boundaries (WS5 evaluator scores)", () => {
		it("avg exactly 7.25 → A", () => {
			// (7 + 7 + 7 + 8) / 4 = 7.25
			expect(deriveGradeFromScores([7, 7, 7, 8])).toBe("A");
		});

		it("just below 7.25 → B", () => {
			// (7 + 7 + 7 + 7.5) / 4 = 7.125
			expect(deriveGradeFromScores([7, 7, 7, 7.5])).toBe("B");
		});

		it("avg exactly 5.75 → B", () => {
			// (5.5 + 5.5 + 6 + 6) / 4 = 5.75
			expect(deriveGradeFromScores([5.5, 5.5, 6, 6])).toBe("B");
		});

		it("just below 5.75 → C", () => {
			// (5.5 + 5.5 + 6 + 5.5) / 4 = 5.625
			expect(deriveGradeFromScores([5.5, 5.5, 6, 5.5])).toBe("C");
		});

		it("avg exactly 4.25 → C", () => {
			// (4 + 4 + 4.5 + 4.5) / 4 = 4.25
			expect(deriveGradeFromScores([4, 4, 4.5, 4.5])).toBe("C");
		});

		it("just below 4.25 → D", () => {
			// (4 + 4 + 4 + 4.5) / 4 = 4.125
			expect(deriveGradeFromScores([4, 4, 4, 4.5])).toBe("D");
		});
	});
});

describe("deriveAxesFromPartMatches", () => {
	it("part1→expression, part2→vocal, part3→examReadiness", () => {
		const axes = deriveAxesFromPartMatches(
			mkPartMatches(
				[mkMatch("A", 0.9, 1)],
				[mkMatch("C", 0.5, 2)],
				[mkMatch("B", 0.8, 3)],
			),
		);
		// part1 A@0.9 → 8+(0.9-0.5)*3=9.2  → expression
		// part2 C@0.5 → 5+0=5             → vocal
		// part3 B@0.8 → 6.5+(0.8-0.5)*3=7.4 → examReadiness
		expect(axes.expression).toBeCloseTo(9.2, 1);
		expect(axes.vocal).toBe(5);
		expect(axes.examReadiness).toBeCloseTo(7.4, 1);
	});

	it("throws when any part has no matches", () => {
		expect(() =>
			deriveAxesFromPartMatches(
				mkPartMatches([mkMatch("A", 0.9, 1)], [], [mkMatch("B", 0.8, 3)]),
			),
		).toThrow(/no_reference_matches/);
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

	it("escalates on empty matches", () => {
		expect(shouldEscalateToJudge([])).toBe(true);
	});
});

describe("buildAnalysisFromPartMatches", () => {
	it("derives internalGrade from average across parts", () => {
		// part1 A@0.9 ≈ 9.2 / part2 A@0.9 ≈ 9.2 / part3 A@0.9 ≈ 9.2 → avg 9.2 ≥ 7.25 → A
		const analysis = buildAnalysisFromPartMatches(
			mkPartMatches(
				[mkMatch("A", 0.9, 1, 1), mkMatch("B", 0.7, 1, 2)],
				[mkMatch("A", 0.9, 2, 3)],
				[mkMatch("A", 0.9, 3, 4)],
			),
			{ test: true },
		);
		expect(analysis.internalGrade).toBe("A");
	});

	it("mixed tiers across parts → grade reflects average", () => {
		// part1 A@0.9 ≈ 9.2 / part2 C@0.5 = 5.0 / part3 D@0.5 = 3.5 → avg 5.9 ≥ 5.75 → B
		const analysis = buildAnalysisFromPartMatches(
			mkPartMatches(
				[mkMatch("A", 0.9, 1)],
				[mkMatch("C", 0.5, 2)],
				[mkMatch("D", 0.5, 3)],
			),
			{},
		);
		expect(analysis.internalGrade).toBe("B");
		expect(analysis.axes.expression).toBeCloseTo(9.2, 1);
		expect(analysis.axes.vocal).toBe(5);
		expect(analysis.axes.examReadiness).toBe(3.5);
	});

	it("calibrationMatchScore = mean of part top1 cosines; cosineConfidence = min", () => {
		const analysis = buildAnalysisFromPartMatches(
			mkPartMatches(
				[mkMatch("A", 0.9, 1)],
				[mkMatch("A", 0.8, 2)],
				[mkMatch("A", 0.7, 3)],
			),
			{},
		);
		expect(analysis.calibrationMatchScore).toBeCloseTo(0.8, 5);
		expect(analysis.cosineConfidence).toBeCloseTo(0.7, 5);
	});

	it("perPartAnalysis exposes top match + score per part", () => {
		const analysis = buildAnalysisFromPartMatches(
			mkPartMatches(
				[mkMatch("A", 0.9, 1)],
				[mkMatch("B", 0.8, 2)],
				[mkMatch("C", 0.6, 3)],
			),
			{},
		);
		expect(analysis.perPartAnalysis).toHaveLength(3);
		expect(analysis.perPartAnalysis?.[0].partIndex).toBe(1);
		expect(analysis.perPartAnalysis?.[0].topMatch.tier).toBe("A");
		expect(analysis.perPartAnalysis?.[1].partIndex).toBe(2);
		expect(analysis.perPartAnalysis?.[2].partIndex).toBe(3);
	});

	it("topMatches union sorted desc, capped at 5", () => {
		const analysis = buildAnalysisFromPartMatches(
			mkPartMatches(
				[mkMatch("A", 0.95, 1, 1), mkMatch("B", 0.75, 1, 2)],
				[mkMatch("A", 0.90, 2, 3), mkMatch("B", 0.70, 2, 4)],
				[mkMatch("A", 0.85, 3, 5), mkMatch("B", 0.65, 3, 6)],
			),
			{},
		);
		expect(analysis.topMatches).toHaveLength(5);
		expect(analysis.topMatches[0].cosineScore).toBe(0.95);
		expect(analysis.topMatches[4].cosineScore).toBe(0.7);
	});

	it("throws when any part has no matches", () => {
		expect(() =>
			buildAnalysisFromPartMatches(
				mkPartMatches([mkMatch("A", 0.9, 1)], [], [mkMatch("B", 0.8, 3)]),
				{},
			),
		).toThrow(/no_reference_matches/);
	});
});
