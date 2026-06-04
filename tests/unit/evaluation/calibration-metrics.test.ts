import { describe, expect, it } from "vitest";
import {
	buildConfusionMatrix,
	type CalibrationResult,
	D13_PASS_THRESHOLD,
	d13Score,
	passesD13,
	type ReproRun,
	summarizeReproCase,
	summarizeReproReport,
	type Tier,
	tierMatchRate,
} from "../../../scripts/calibration-metrics";

const r = (trueTier: Tier, predictedGrade: Tier, i = 0): CalibrationResult => ({
	videoId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
	trueTier,
	predictedGrade,
});

describe("tierMatchRate", () => {
	it("counts exact tier matches", () => {
		const out = tierMatchRate([r("A", "A", 1), r("B", "A", 2), r("C", "A", 3)]);
		expect(out.matched).toBe(1);
		expect(out.total).toBe(3);
		expect(out.rate).toBeCloseTo(1 / 3, 5);
	});

	it("handles empty input without dividing by zero", () => {
		const out = tierMatchRate([]);
		expect(out).toEqual({ matched: 0, total: 0, rate: 0 });
	});

	it("all-match → rate 1", () => {
		expect(tierMatchRate([r("A", "A"), r("B", "B")]).rate).toBe(1);
	});
});

describe("d13Score + passesD13", () => {
	it("scales matched/total to a 0-10 score", () => {
		expect(d13Score(7, 10)).toBe(7);
		expect(d13Score(1, 6)).toBeCloseTo(1.667, 3);
		expect(d13Score(0, 0)).toBe(0);
	});

	it("gate passes at exactly 7/10 and fails below", () => {
		expect(D13_PASS_THRESHOLD).toBe(7);
		expect(passesD13(7, 10)).toBe(true);
		expect(passesD13(6, 10)).toBe(false);
		expect(passesD13(1, 6)).toBe(false); // the cosine baseline ≈ 1.7/10
	});
});

describe("buildConfusionMatrix", () => {
	it("rows = true tier, cols = predicted grade", () => {
		const m = buildConfusionMatrix([
			r("A", "A", 1),
			r("A", "B", 2),
			r("B", "A", 3),
			r("B", "A", 4),
			r("C", "A", 5),
		]);
		expect(m.A.A).toBe(1);
		expect(m.A.B).toBe(1);
		expect(m.B.A).toBe(2);
		expect(m.C.A).toBe(1);
		// untouched cells are zero, all tiers present
		expect(m.D.D).toBe(0);
		expect(m.A.C).toBe(0);
	});

	it("empty input → all-zero matrix with every tier key", () => {
		const m = buildConfusionMatrix([]);
		for (const t of ["A", "B", "C", "D"] as Tier[]) {
			expect(m[t]).toEqual({ A: 0, B: 0, C: 0, D: 0 });
		}
	});
});

describe("summarizeReproCase", () => {
	const run = (g: Tier, score?: number): ReproRun => ({
		predictedGrade: g,
		score,
	});

	it("deterministic runs → gradeChanged false, spread 0", () => {
		const out = summarizeReproCase("v1", [
			run("A", 8.0),
			run("A", 8.0),
			run("A", 8.0),
		]);
		expect(out.runs).toBe(3);
		expect(out.distinctGrades).toEqual(["A"]);
		expect(out.gradeChanged).toBe(false);
		expect(out.scoreSpread).toBe(0);
	});

	it("varying grades + scores → gradeChanged true, spread = max-min", () => {
		const out = summarizeReproCase("v2", [
			run("A", 7.6),
			run("B", 7.2),
			run("A", 7.9),
		]);
		expect(out.gradeChanged).toBe(true);
		expect(new Set(out.distinctGrades)).toEqual(new Set<Tier>(["A", "B"]));
		expect(out.scoreSpread).toBeCloseTo(0.7, 5);
	});

	it("missing scores → spread 0", () => {
		const out = summarizeReproCase("v3", [run("A"), run("A")]);
		expect(out.scoreSpread).toBe(0);
	});
});

describe("summarizeReproReport", () => {
	it("aggregates unstable cases and worst spread", () => {
		const stable = summarizeReproCase("v1", [
			{ predictedGrade: "A", score: 8 },
			{ predictedGrade: "A", score: 8 },
		]);
		const unstable = summarizeReproCase("v2", [
			{ predictedGrade: "A", score: 7.6 },
			{ predictedGrade: "B", score: 6.9 },
		]);
		const out = summarizeReproReport([stable, unstable]);
		expect(out.totalCases).toBe(2);
		expect(out.unstableCases).toBe(1);
		expect(out.maxScoreSpread).toBeCloseTo(0.7, 5);
	});

	it("empty → zeros", () => {
		expect(summarizeReproReport([])).toEqual({
			totalCases: 0,
			unstableCases: 0,
			maxScoreSpread: 0,
		});
	});
});
