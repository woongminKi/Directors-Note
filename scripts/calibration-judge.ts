#!/usr/bin/env bun
/**
 * Early-validation runner for the Gemini-on-Vertex LLM judge.
 *
 * WHY: the cosine scorer fails the D13 gate (1/6 tier match). Before investing
 * in production wiring (factory/route/SSE), measure whether the multimodal
 * judge clears ≥7/10 against the 6 local reference videos whose true tiers are
 * known from their filenames (상=A, 중=B, 하=C).
 *
 * HOW: for each of downloads/{상1,상2,중1,중2,하1,하2}.mp4 → stage to GCS, run
 * GeminiVideoJudge on the FULL video, collect predicted grade + 4 axes, then
 * reuse calibration-metrics.ts for tier-match / D13 score / confusion matrix.
 * GCS staging objects are cleaned up by judgeLocalFile() itself (finally).
 *
 * Usage: bun run scripts/calibration-judge.ts   (alias: bun run calibrate:judge)
 * Reads env from .env.local (bun auto-loads).
 *
 * Spend: ~6 Gemini video generateContent calls (approved).
 */

import { resolve } from "node:path";
import type { JudgeResult } from "@/lib/evaluation/llm-judge";
import { GeminiVideoJudge } from "@/lib/evaluation/llm-judge";
import {
	buildConfusionMatrix,
	type CalibrationResult,
	D13_PASS_THRESHOLD,
	d13Score,
	passesD13,
	TIERS,
	type Tier,
	tierMatchRate,
} from "./calibration-metrics";

interface VideoCase {
	file: string;
	label: string;
	trueTier: Tier;
}

const CASES: VideoCase[] = [
	{ file: "downloads/상1.mp4", label: "A#1", trueTier: "A" },
	{ file: "downloads/상2.mp4", label: "A#2", trueTier: "A" },
	{ file: "downloads/중1.mp4", label: "B#1", trueTier: "B" },
	{ file: "downloads/중2.mp4", label: "B#2", trueTier: "B" },
	{ file: "downloads/하1.mp4", label: "C#1", trueTier: "C" },
	{ file: "downloads/하2.mp4", label: "C#2", trueTier: "C" },
];

interface JudgeEnv {
	projectId: string;
	location: string;
	credentialsJson: string;
	gcsBucket: string;
}

function loadEnv(): JudgeEnv {
	const missing: string[] = [];
	const get = (k: string): string => {
		const v = process.env[k];
		if (!v) {
			missing.push(k);
			return "";
		}
		return v;
	};
	const env: JudgeEnv = {
		projectId: get("GOOGLE_VERTEX_PROJECT_ID"),
		location: get("GOOGLE_VERTEX_LOCATION"),
		credentialsJson: get("GOOGLE_APPLICATION_CREDENTIALS_JSON"),
		gcsBucket: get("GCS_VIDEO_BUCKET"),
	};
	if (missing.length > 0) {
		console.error(`Missing env vars: ${missing.join(", ")}`);
		process.exit(2);
	}
	return env;
}

const fmt = (n: number | undefined, w = 5): string =>
	(n === undefined ? "-" : n.toFixed(1)).padStart(w);

async function main(): Promise<void> {
	const env = loadEnv();
	const model = process.env.GEMINI_JUDGE_MODEL ?? "gemini-2.5-flash";
	const judge = new GeminiVideoJudge({
		projectId: env.projectId,
		location: env.location,
		credentialsJson: env.credentialsJson,
		gcsVideoBucket: env.gcsBucket,
	});

	console.log(
		"D13 calibration — Gemini multimodal LLM judge (early validation)",
	);
	console.log(`  model:    ${model}`);
	console.log(`  location: ${env.location}`);
	console.log(`  videos:   ${CASES.length} (downloads/)`);
	console.log("");

	const results: Array<
		CalibrationResult & { label: string; judge: JudgeResult }
	> = [];
	const wall0 = Date.now();

	for (const c of CASES) {
		const path = resolve(c.file);
		process.stdout.write(`  judging ${c.label} (${c.file}) ... `);
		try {
			const r = await judge.judgeLocalFile(path);
			results.push({
				videoId: c.file,
				trueTier: c.trueTier,
				predictedGrade: r.internalGrade,
				label: c.label,
				judge: r,
			});
			console.log(
				`pred=${r.internalGrade} holistic=${r.holisticGrade} (${(r.provenance.latencyMs / 1000).toFixed(1)}s)`,
			);
		} catch (err) {
			console.log("FAILED");
			console.error(`    ${(err as Error).message}`);
			throw err;
		}
	}

	const wallMs = Date.now() - wall0;

	// ─── per-video table ───
	console.log("");
	console.log("Per-video results:");
	console.log("  video  true  pred  holi   vocal  expr  move  exam   match");
	console.log(`  ${"─".repeat(62)}`);
	for (const r of results) {
		const a = r.judge.axes;
		const match = r.predictedGrade === r.trueTier ? "✅" : "❌";
		console.log(
			`  ${r.label.padEnd(5)}  ${r.trueTier}     ${r.predictedGrade}     ${r.judge.holisticGrade}    ` +
				`${fmt(a.vocal)} ${fmt(a.expression)} ${fmt(r.judge.movement)} ${fmt(a.examReadiness)}   ${match}`,
		);
	}

	// ─── rationale dump ───
	console.log("");
	console.log("Per-axis rationale (한국어):");
	for (const r of results) {
		console.log(`  [${r.label}] true=${r.trueTier} pred=${r.predictedGrade}`);
		console.log(`    발성:   ${r.judge.rationale.vocal}`);
		console.log(`    표정:   ${r.judge.rationale.expression}`);
		console.log(`    몸짓:   ${r.judge.rationale.movement}`);
		console.log(`    입시:   ${r.judge.rationale.examReadiness}`);
	}

	// ─── gate ───
	const { matched, total } = tierMatchRate(results);
	const score = d13Score(matched, total);
	const pass = passesD13(matched, total);

	console.log("");
	console.log("Confusion matrix (rows = true tier, cols = predicted grade):");
	console.log("        pred→   A    B    C    D");
	const matrix = buildConfusionMatrix(results);
	for (const t of TIERS) {
		const row = TIERS.map((p) => String(matrix[t][p]).padStart(4)).join(" ");
		console.log(`  true ${t}       ${row}`);
	}

	console.log("");
	console.log(`  tier-match: ${matched}/${total}`);
	console.log(
		`  D13-equivalent score: ${score.toFixed(1)}/10 (gate: ≥ ${D13_PASS_THRESHOLD})`,
	);
	console.log(
		`  ${pass ? "✅ PASS" : "❌ FAIL"} — D13 calibration gate ${pass ? "met" : "NOT met"}`,
	);

	// ─── wall-clock + rough cost ───
	const latencies = results.map((r) => r.judge.provenance.latencyMs);
	const avgLatency =
		latencies.reduce((s, x) => s + x, 0) / Math.max(1, latencies.length);
	console.log("");
	console.log(
		`  wall-clock: ${(wallMs / 1000).toFixed(1)}s total, ${(avgLatency / 1000).toFixed(1)}s avg/video`,
	);
	console.log(
		`  spend: ${results.length} Gemini ${model} video generateContent calls`,
	);
	console.log(
		"  cost note: ~240-257s video each. gemini-2.5-flash video pricing is dominated by",
	);
	console.log(
		"    input video tokens (~few hundred tok/s of video) — rough order ~$0.01-0.05/video,",
	);
	console.log(
		"    i.e. << $0.50 total for the 6-video run. Confirm against billing console.",
	);

	process.exitCode = pass ? 0 : 0; // early-validation: never hard-fail the run.
}

main().catch((err) => {
	console.error("ERR:", err);
	process.exit(99);
});
