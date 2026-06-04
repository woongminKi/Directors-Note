#!/usr/bin/env bun
/**
 * D13 calibration harness — leave-one-out tier-match measurement.
 *
 * WHY: The D13 hard gate requires ≥7/10 "tier match" on non-student calibration
 * data. This script measures that against the *real* production scoring path
 * (grade-derivation.ts), so the same harness can later grade an LLM-judge
 * evaluator on the identical gate.
 *
 * HOW (cosine baseline, leave-one-out):
 *   For each reference video V (treated as a held-out "student"):
 *     for each part p in {1,2,3}:
 *       find top-K cosine matches among the OTHER reference videos' SAME-part
 *       embeddings, EXCLUDING V itself.
 *     assemble PartMatchesByPart exactly as production (vertex.ts) does
 *     → feed into buildAnalysisFromPartMatches() (the REAL scorer, imported)
 *     → compare predicted internalGrade vs V's true tier (reference_videos.level).
 *
 *   The production RPC search_reference_matches_by_part CANNOT exclude self
 *   (a real student isn't in the reference set), so the harness runs its own
 *   self-excluding nearest-neighbor query. This is the correct LOO setup.
 *
 * Usage:
 *   bun run scripts/calibration-harness.ts            # measure + print, exit 0
 *   bun run scripts/calibration-harness.ts --strict   # exit 1 if D13 < 7/10
 *   bun run scripts/calibration-harness.ts --repro     # reproducibility report
 *
 * Reads DATABASE_URL from process.env (bun auto-loads .env.local).
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
	buildAnalysisFromPartMatches,
	type PartMatchesByPart,
} from "@/lib/evaluation/grade-derivation";
import type { GeminiVideoJudge } from "@/lib/evaluation/llm-judge";
import type {
	AxisScores,
	PartIndex,
	ReferenceMatch,
} from "@/lib/evaluation/types";
import {
	buildConfusionMatrix,
	type CalibrationResult,
	type ConfusionMatrix,
	D13_PASS_THRESHOLD,
	d13Score,
	passesD13,
	type ReproRun,
	summarizeReproCase,
	summarizeReproReport,
	TIERS,
	type Tier,
	tierMatchRate,
} from "./calibration-metrics";

const TOP_K = 5;
const PARTS: readonly PartIndex[] = [1, 2, 3] as const;

// ─── evaluator-agnostic seam ────────────────────────────────────────────────
// A held-out calibration case. The cosine evaluator only needs videoId +
// trueTier (the embeddings live in the DB it already has a handle to). A future
// judge evaluator may need more context — widen this type then.
export interface CalibrationCase {
	videoId: string;
	trueTier: Tier;
	label: string; // e.g. "A#1" for printing
}

export interface EvaluatorOutput {
	predictedGrade: Tier;
	axes?: AxisScores;
	detail?: unknown;
}

export type Evaluator = (c: CalibrationCase) => Promise<EvaluatorOutput>;

// ─── DB layer ────────────────────────────────────────────────────────────────

type DbHandle = ReturnType<typeof drizzle>;

interface RefVideoRow {
	id: string;
	level: string;
}

interface NeighborRow {
	source_reference_video_id: string;
	tier: string;
	scene_type: string;
	cosine_similarity: string | number;
}

// All reference videos for the academy that has the most reference embeddings.
// (Dev DB has a single academy; this scopes correctly if more are added.)
async function loadCalibrationCases(
	db: DbHandle,
): Promise<{ academyId: string; cases: CalibrationCase[] }> {
	const academyRows = (await db.execute(
		sql`SELECT academy_id, count(*) AS n
		    FROM embeddings
		    WHERE source_type = 'reference_video'
		    GROUP BY academy_id
		    ORDER BY n DESC
		    LIMIT 1`,
	)) as unknown as Array<{ academy_id: string }>;
	if (academyRows.length === 0) {
		throw new Error("no_reference_embeddings — seed the reference set first");
	}
	const academyId = academyRows[0].academy_id;

	const refRows = (await db.execute(
		sql`SELECT DISTINCT rv.id, rv.level
		    FROM reference_videos rv
		    JOIN embeddings e ON e.source_reference_video_id = rv.id
		    WHERE rv.academy_id = ${academyId}::uuid
		      AND e.source_type = 'reference_video'
		    ORDER BY rv.level, rv.id`,
	)) as unknown as RefVideoRow[];

	// Stable per-tier index for human-readable labels (A#1, A#2, B#1, ...).
	const tierCounter: Record<string, number> = {};
	const cases: CalibrationCase[] = refRows.map((r) => {
		const tier = r.level as Tier;
		tierCounter[tier] = (tierCounter[tier] ?? 0) + 1;
		return {
			videoId: r.id,
			trueTier: tier,
			label: `${tier}#${tierCounter[tier]}`,
		};
	});
	return { academyId, cases };
}

// Self-excluding nearest neighbors for one held-out video + one part.
// Mirrors vertex.ts cosineSearchByPart mapping into ReferenceMatch, but the
// query vector is the held-out video's own part embedding and V is excluded.
async function neighborsForPart(
	db: DbHandle,
	academyId: string,
	heldOutVideoId: string,
	partIndex: PartIndex,
): Promise<ReferenceMatch[]> {
	const rows = (await db.execute(
		sql`SELECT
		      other.source_reference_video_id,
		      rv.level AS tier,
		      rv.scene_type,
		      (1 - (other.vector <=> self.vector))::numeric AS cosine_similarity
		    FROM embeddings self
		    JOIN embeddings other
		      ON other.academy_id = self.academy_id
		     AND other.source_type = 'reference_video'
		     AND other.part_index = self.part_index
		     AND other.source_reference_video_id <> self.source_reference_video_id
		    JOIN reference_videos rv ON rv.id = other.source_reference_video_id
		    WHERE self.academy_id = ${academyId}::uuid
		      AND self.source_type = 'reference_video'
		      AND self.source_reference_video_id = ${heldOutVideoId}::uuid
		      AND self.part_index = ${partIndex}::smallint
		    ORDER BY other.vector <=> self.vector ASC
		    LIMIT ${TOP_K}`,
	)) as unknown as NeighborRow[];

	return rows.map((r) => ({
		referenceVideoId: r.source_reference_video_id,
		tier: r.tier as Tier,
		sceneType: r.scene_type,
		cosineScore: Number(r.cosine_similarity),
		partIndex,
	}));
}

async function partMatchesForVideo(
	db: DbHandle,
	academyId: string,
	heldOutVideoId: string,
): Promise<PartMatchesByPart> {
	const entries = await Promise.all(
		PARTS.map(
			async (p) =>
				[p, await neighborsForPart(db, academyId, heldOutVideoId, p)] as const,
		),
	);
	const byPart = Object.fromEntries(entries) as PartMatchesByPart;
	return { 1: byPart[1] ?? [], 2: byPart[2] ?? [], 3: byPart[3] ?? [] };
}

// ─── evaluators ──────────────────────────────────────────────────────────────

// Cosine leave-one-out evaluator: assembles production-shaped PartMatchesByPart
// and runs the REAL grade-derivation scorer. Deterministic.
function makeCosineLeaveOneOutEvaluator(
	db: DbHandle,
	academyId: string,
): Evaluator {
	return async (c) => {
		const partMatches = await partMatchesForVideo(db, academyId, c.videoId);
		const analysis = buildAnalysisFromPartMatches(partMatches, {
			harness: "calibration-loo",
			heldOutVideoId: c.videoId,
		});
		return {
			predictedGrade: analysis.internalGrade,
			axes: analysis.axes,
			detail: analysis,
		};
	};
}

// Phase1 judgeEvaluator — an Evaluator that sends the held-out video to the
// Gemini multimodal LLM-as-judge and parses back a tier + axes. It plugs into
// the exact same runCalibration()/measureReproducibility() harness, so the D13
// gate and the metric/printing code stay evaluator-independent.
//
// The cosine path keys off DB embeddings (videoId is a reference_videos.id);
// the judge keys off the raw video file. They share the seam but not the data
// source, so the judge evaluator takes a videoId→filePath resolver. For the
// local 6-video flow, scripts/calibration-judge.ts is the primary runner — this
// factory is the production-shaped seam for when reference rows carry a path.
export function makeJudgeEvaluator(
	judge: GeminiVideoJudge,
	resolveFilePath: (c: CalibrationCase) => string,
): Evaluator {
	return async (c) => {
		const result = await judge.judgeLocalFile(resolveFilePath(c));
		return {
			predictedGrade: result.internalGrade,
			axes: result.axes,
			detail: result,
		};
	};
}

// ─── harness core (evaluator-independent) ────────────────────────────────────

async function runCalibration(
	evaluator: Evaluator,
	cases: CalibrationCase[],
): Promise<Array<CalibrationResult & { label: string; axes?: AxisScores }>> {
	const out: Array<CalibrationResult & { label: string; axes?: AxisScores }> =
		[];
	for (const c of cases) {
		const { predictedGrade, axes } = await evaluator(c);
		out.push({
			videoId: c.videoId,
			trueTier: c.trueTier,
			predictedGrade,
			label: c.label,
			axes,
		});
	}
	return out;
}

function meanAxis(axes?: AxisScores): number | undefined {
	if (!axes) return undefined;
	return (axes.expression + axes.vocal + axes.examReadiness) / 3;
}

// Run each case `runs` times → per-case grade/score spread.
async function measureReproducibility(
	evaluator: Evaluator,
	cases: CalibrationCase[],
	runs = 3,
) {
	const reports = [];
	for (const c of cases) {
		const caseRuns: ReproRun[] = [];
		for (let i = 0; i < runs; i++) {
			const r = await evaluator(c);
			caseRuns.push({
				predictedGrade: r.predictedGrade,
				score: meanAxis(r.axes),
			});
		}
		reports.push(summarizeReproCase(c.videoId, caseRuns));
	}
	return { perCase: reports, summary: summarizeReproReport(reports) };
}

// ─── printing ────────────────────────────────────────────────────────────────

function fmt(n: number | undefined, w = 5): string {
	return (n === undefined ? "-" : n.toFixed(1)).padStart(w);
}

function printResultsTable(
	results: Array<CalibrationResult & { label: string; axes?: AxisScores }>,
): void {
	console.log("");
	console.log("Per-video (leave-one-out):");
	console.log("  video  true  pred   expr  vocal  exam   match");
	console.log("  " + "─".repeat(48));
	for (const r of results) {
		const match = r.predictedGrade === r.trueTier ? "✅" : "❌";
		console.log(
			`  ${r.label.padEnd(5)}  ${r.trueTier}     ${r.predictedGrade}    ` +
				`${fmt(r.axes?.expression)} ${fmt(r.axes?.vocal)} ${fmt(
					r.axes?.examReadiness,
				)}   ${match}`,
		);
	}
}

function printConfusionMatrix(matrix: ConfusionMatrix): void {
	console.log("");
	console.log("Confusion matrix (rows = true tier, cols = predicted grade):");
	console.log("        pred→   A    B    C    D");
	for (const t of TIERS) {
		const row = TIERS.map((p) => String(matrix[t][p]).padStart(4)).join(" ");
		console.log(`  true ${t}       ${row}`);
	}
}

function printGate(matched: number, total: number): boolean {
	const score = d13Score(matched, total);
	const pass = passesD13(matched, total);
	console.log("");
	console.log(`  tier-match: ${matched}/${total}`);
	console.log(
		`  D13-equivalent score: ${score.toFixed(1)}/10 (gate: ≥ ${D13_PASS_THRESHOLD})`,
	);
	console.log(
		`  ${pass ? "✅ PASS" : "❌ FAIL"} — D13 calibration gate ${
			pass ? "met" : "NOT met"
		}`,
	);
	return pass;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const strict = argv.includes("--strict");
	const repro = argv.includes("--repro");

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("Missing env var: DATABASE_URL");
		process.exit(2);
	}

	const pg = postgres(databaseUrl, { prepare: false, max: 3 });
	const db = drizzle(pg);

	try {
		const { academyId, cases } = await loadCalibrationCases(db);
		console.log("D13 calibration harness — cosine leave-one-out");
		console.log(`  academy: ${academyId}`);
		console.log(`  reference videos (held-out cases): ${cases.length}`);
		console.log(
			`  evaluator: cosine (production grade-derivation), K=${TOP_K}`,
		);

		const evaluator = makeCosineLeaveOneOutEvaluator(db, academyId);

		if (repro) {
			console.log("");
			console.log("Reproducibility (3 runs/case):");
			const { perCase, summary } = await measureReproducibility(
				evaluator,
				cases,
				3,
			);
			for (const c of perCase) {
				const label =
					cases.find((x) => x.videoId === c.videoId)?.label ?? c.videoId;
				console.log(
					`  ${label.padEnd(5)} runs=${c.runs} grades=[${c.distinctGrades.join(
						",",
					)}] gradeChanged=${c.gradeChanged} scoreSpread=${c.scoreSpread.toFixed(
						3,
					)}`,
				);
			}
			console.log(
				`  summary: ${summary.unstableCases}/${summary.totalCases} unstable, maxScoreSpread=${summary.maxScoreSpread.toFixed(
					3,
				)}`,
			);
			console.log(
				summary.unstableCases === 0
					? "  → deterministic (expected for cosine; meaningful once judge lands)."
					: "  → non-deterministic evaluator detected.",
			);
		}

		const results = await runCalibration(evaluator, cases);
		printResultsTable(results);

		const { matched, total } = tierMatchRate(results);
		printConfusionMatrix(buildConfusionMatrix(results));
		const pass = printGate(matched, total);

		if (strict && !pass) {
			process.exitCode = 1;
			return;
		}
		process.exitCode = 0;
	} finally {
		await pg.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error("ERR:", err);
	process.exit(99);
});
