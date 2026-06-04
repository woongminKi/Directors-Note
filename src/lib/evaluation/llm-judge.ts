// Gemini-on-Vertex multimodal LLM judge.
//
// Pivot from the cosine scorer (D13: 1/6 tier match). This judge WATCHES the
// full video (visual + audio) and scores it against judge-rubric-v1. It maps
// the model's 4 axes to AxisScores (+ movement, stored separately) and derives
// the final grade via the existing deriveGradeFromScores. Coach-only (P2).
//
// Production integration (factory/route/SSE) is OUT OF SCOPE — this module is
// usable standalone (e.g. by scripts/calibration-judge.ts) and ready to wire
// into the production VideoAnalysisService later.

import { deleteFromGcs, getGcpToken, stageLocalFileToGcs } from "./gcs-staging";
import { deriveGradeFromScores } from "./grade-derivation";
import {
	JUDGE_PROMPT,
	JUDGE_RESPONSE_SCHEMA,
	JUDGE_RUBRIC_VERSION,
	type JudgeRawResponse,
} from "./prompts/judge-rubric-v1";
import type { AxisScores } from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";
const round1 = (n: number) => Math.round(n * 10) / 10;

function clampScore(n: number, axis: string): number {
	if (typeof n !== "number" || !Number.isFinite(n)) {
		throw new Error(`judge_axis_not_a_number(${axis}): ${String(n)}`);
	}
	return round1(Math.max(0, Math.min(10, n)));
}

export interface JudgeDeps {
	projectId: string;
	location: string;
	credentialsJson: string;
	gcsVideoBucket: string;
	model?: string;
}

export interface JudgeResult {
	// 4 scored axes (movement included — superset of AxisScores).
	axes: AxisScores; // vocal / expression / examReadiness (DB columns)
	movement: number; // stored in rawResponseJson, NOT a DB column
	internalGrade: "A" | "B" | "C" | "D"; // simple avg of the 4 axes
	holisticGrade: "A" | "B" | "C" | "D"; // judge's own gestalt grade
	rationale: JudgeRawResponse["rationale"];
	provenance: {
		model: string;
		rubricVersion: string;
		latencyMs: number;
	};
	rawResponseJson: unknown;
}

export class GeminiVideoJudge {
	private readonly model: string;

	constructor(private readonly deps: JudgeDeps) {
		this.model = deps.model ?? process.env.GEMINI_JUDGE_MODEL ?? DEFAULT_MODEL;
	}

	// Score a video already living in GCS (gs:// URI).
	async judgeGcsUri(gcsUri: string): Promise<JudgeResult> {
		const token = await getGcpToken(this.deps.credentialsJson);
		return this.callGemini(gcsUri, token);
	}

	// Score a local file: stage to GCS, judge, clean up staging in a finally.
	async judgeLocalFile(filePath: string): Promise<JudgeResult> {
		const staged = await stageLocalFileToGcs(
			filePath,
			this.deps.gcsVideoBucket,
			this.deps.credentialsJson,
		);
		try {
			return await this.callGemini(staged.gcsUri, staged.token);
		} finally {
			await deleteFromGcs(staged.bucket, staged.objectName, staged.token).catch(
				() => {},
			);
		}
	}

	private async callGemini(
		gcsUri: string,
		token: string,
	): Promise<JudgeResult> {
		const url =
			`https://${this.deps.location}-aiplatform.googleapis.com/v1/projects/` +
			`${this.deps.projectId}/locations/${this.deps.location}/publishers/google/models/${this.model}:generateContent`;

		const body = {
			contents: [
				{
					role: "user",
					parts: [
						{ fileData: { mimeType: "video/mp4", fileUri: gcsUri } },
						{ text: JUDGE_PROMPT },
					],
				},
			],
			generationConfig: {
				temperature: 0,
				responseMimeType: "application/json",
				responseSchema: JUDGE_RESPONSE_SCHEMA,
			},
		};

		const t0 = Date.now();
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
		const latencyMs = Date.now() - t0;

		if (!res.ok) {
			throw new Error(`vertex_judge_failed: ${res.status} ${await res.text()}`);
		}

		const data = (await res.json()) as {
			candidates?: Array<{
				content?: { parts?: Array<{ text?: string }> };
				finishReason?: string;
			}>;
		};
		const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) {
			throw new Error(
				`vertex_judge_empty_response: finishReason=${
					data.candidates?.[0]?.finishReason ?? "unknown"
				} body=${JSON.stringify(data).slice(0, 500)}`,
			);
		}

		let parsed: JudgeRawResponse;
		try {
			parsed = JSON.parse(text) as JudgeRawResponse;
		} catch (e) {
			throw new Error(
				`vertex_judge_bad_json: ${(e as Error).message} :: ${text.slice(0, 500)}`,
			);
		}

		const vocal = clampScore(parsed.vocal, "vocal");
		const expression = clampScore(parsed.expression, "expression");
		const movement = clampScore(parsed.movement, "movement");
		const examReadiness = clampScore(parsed.examReadiness, "examReadiness");

		// Grade = simple average of all 4 axes (rubric §3 option A).
		const internalGrade = deriveGradeFromScores([
			vocal,
			expression,
			movement,
			examReadiness,
		]);

		const holisticGrade = parsed.holisticGrade;

		return {
			axes: { vocal, expression, examReadiness },
			movement,
			internalGrade,
			holisticGrade,
			rationale: parsed.rationale,
			provenance: {
				model: this.model,
				rubricVersion: JUDGE_RUBRIC_VERSION,
				latencyMs,
			},
			rawResponseJson: {
				judge: parsed,
				movement,
				model: this.model,
				rubricVersion: JUDGE_RUBRIC_VERSION,
			},
		};
	}
}
