// D13 calibration harness — PURE metric helpers (no DB, no I/O).
//
// Extracted so they can be unit-tested without a live Postgres connection.
// The harness script (calibration-harness.ts) wires these to real DB data +
// the production grade-derivation scoring. Keep this file side-effect free.

export type Tier = "A" | "B" | "C" | "D";

export const TIERS: readonly Tier[] = ["A", "B", "C", "D"] as const;

export interface CalibrationResult {
	videoId: string;
	trueTier: Tier;
	predictedGrade: Tier;
}

// tier-match rate = fraction of cases where predictedGrade === trueTier.
export function tierMatchRate(results: CalibrationResult[]): {
	matched: number;
	total: number;
	rate: number;
} {
	const total = results.length;
	const matched = results.filter((r) => r.predictedGrade === r.trueTier).length;
	return { matched, total, rate: total === 0 ? 0 : matched / total };
}

// D13-equivalent score on a 0-10 scale (matched/total * 10). Gate passes at ≥ 7.
export function d13Score(matched: number, total: number): number {
	if (total === 0) return 0;
	return (matched / total) * 10;
}

export const D13_PASS_THRESHOLD = 7;

export function passesD13(matched: number, total: number): boolean {
	return d13Score(matched, total) >= D13_PASS_THRESHOLD;
}

// Confusion matrix: rows = true tier, cols = predicted grade. matrix[true][pred].
export type ConfusionMatrix = Record<Tier, Record<Tier, number>>;

export function buildConfusionMatrix(
	results: CalibrationResult[],
): ConfusionMatrix {
	const matrix = {} as ConfusionMatrix;
	for (const t of TIERS) {
		matrix[t] = { A: 0, B: 0, C: 0, D: 0 };
	}
	for (const r of results) {
		matrix[r.trueTier][r.predictedGrade] += 1;
	}
	return matrix;
}

// Reproducibility spread per case: across N runs of the same case, how much did
// the predicted grade and the numeric score move? Deterministic evaluators →
// gradeChanged=false and scoreSpread=0. Stochastic (judge) → meaningful spread.
export interface ReproRun {
	predictedGrade: Tier;
	// Representative numeric score for variance (e.g. mean axis score). Optional.
	score?: number;
}

export interface ReproCaseReport {
	videoId: string;
	runs: number;
	distinctGrades: Tier[];
	gradeChanged: boolean;
	scoreSpread: number; // max - min across runs (0 if no scores)
}

export function summarizeReproCase(
	videoId: string,
	runs: ReproRun[],
): ReproCaseReport {
	const distinctGrades = [...new Set(runs.map((r) => r.predictedGrade))];
	const scores = runs
		.map((r) => r.score)
		.filter((s): s is number => typeof s === "number");
	const scoreSpread =
		scores.length === 0 ? 0 : Math.max(...scores) - Math.min(...scores);
	return {
		videoId,
		runs: runs.length,
		distinctGrades,
		gradeChanged: distinctGrades.length > 1,
		scoreSpread,
	};
}

// Aggregate reproducibility: how many cases were non-deterministic + worst spread.
export function summarizeReproReport(cases: ReproCaseReport[]): {
	totalCases: number;
	unstableCases: number;
	maxScoreSpread: number;
} {
	return {
		totalCases: cases.length,
		unstableCases: cases.filter((c) => c.gradeChanged).length,
		maxScoreSpread: cases.reduce((m, c) => Math.max(m, c.scoreSpread), 0),
	};
}
