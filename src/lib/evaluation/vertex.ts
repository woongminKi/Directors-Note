import type { SupabaseClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { GoogleAuth } from "google-auth-library";
import type { db as DbClient } from "@/lib/db/client";
import { STUDENT_VIDEOS_BUCKET } from "@/lib/evaluations/constants";
import {
	buildAnalysisFromPartMatches,
	type PartMatchesByPart,
} from "./grade-derivation";
import type {
	AIAnalysis,
	PartIndex,
	ProgressEvent,
	ReferenceMatch,
	VideoAnalysisRequest,
	VideoAnalysisService,
} from "./types";

// Vertex multimodalembedding@001 — video 모드는 1408d embedding 반환.
// 영상 구조 (도메인):
//   part 1 (0-90s):    자유 연기 → axis: expression
//   part 2 (90-150s):  무용·노래 → axis: vocal
//   part 3 (150-270s): 압박 면접 → axis: examReadiness
// 각 part 마다 Vertex 호출 (병렬) → 같은 part 의 reference 임베딩과 cosine 매칭.

const VERTEX_MODEL = "multimodalembedding@001";
const EMBEDDING_DIMENSION = 1408;

interface PartWindow {
	partIndex: PartIndex;
	startOffsetSec: number;
	endOffsetSec: number;
}

const PART_WINDOWS: readonly PartWindow[] = [
	{ partIndex: 1, startOffsetSec: 0, endOffsetSec: 90 },
	{ partIndex: 2, startOffsetSec: 90, endOffsetSec: 150 },
	{ partIndex: 3, startOffsetSec: 150, endOffsetSec: 270 },
] as const;

interface VertexDeps {
	projectId: string;
	location: string;
	credentialsJson: string;
	gcsVideoBucket: string;
	supabase: SupabaseClient;
	db: typeof DbClient;
}

interface VertexPredictResponse {
	predictions?: Array<{
		videoEmbeddings?: Array<{
			embedding: number[];
			startOffsetSec?: number;
			endOffsetSec?: number;
		}>;
	}>;
}

type CosineMatchRow = {
	reference_video_id: string;
	tier: string;
	scene_type: string;
	cosine_similarity: string | number;
	[k: string]: unknown;
};

interface PartEmbedding {
	partIndex: PartIndex;
	embedding: number[];
}

export class VertexVideoAnalysisService implements VideoAnalysisService {
	private auth: GoogleAuth;

	constructor(private readonly deps: VertexDeps) {
		this.auth = new GoogleAuth({
			credentials: JSON.parse(deps.credentialsJson),
			scopes: ["https://www.googleapis.com/auth/cloud-platform"],
		});
	}

	async analyzeStreaming(
		req: VideoAnalysisRequest,
		onProgress: (event: ProgressEvent) => void,
	): Promise<AIAnalysis> {
		const gcsObjectName = `${req.academyId}/${req.evaluationId}.mp4`;
		const gcsUri = `gs://${this.deps.gcsVideoBucket}/${gcsObjectName}`;

		try {
			// STEP 1: Supabase → GCS staging
			const videoBytes = await this.downloadFromSupabase(req.studentVideoUrl);
			await this.uploadToGcs(gcsObjectName, videoBytes);
			onProgress({
				step: "frames_extracted",
				frameCount: 0,
				durationMs: 0,
			});

			// STEP 2: Vertex multimodal embedding — 3 parts in parallel
			const partEmbeddings = await Promise.all(
				PART_WINDOWS.map(
					async (w): Promise<PartEmbedding> => ({
						partIndex: w.partIndex,
						embedding: await this.callVertexEmbedding(gcsUri, w),
					}),
				),
			);
			const part1Preview =
				partEmbeddings.find((e) => e.partIndex === 1)?.embedding.slice(0, 10) ??
				[];
			onProgress({
				step: "embedding_generated",
				vectorPreview: part1Preview,
			});

			// STEP 3: pgvector cosine search vs academy reference set — per part
			const partMatches = await this.cosineSearchAllParts(
				partEmbeddings,
				req.academyId,
			);
			const allMatches = [
				...partMatches[1],
				...partMatches[2],
				...partMatches[3],
			].sort((a, b) => b.cosineScore - a.cosineScore);
			onProgress({ step: "matches_computed", matches: allMatches.slice(0, 5) });

			// STEP 4: derive analysis + cache 3 evaluation embeddings
			const analysis = buildAnalysisFromPartMatches(partMatches, {
				vertexModel: VERTEX_MODEL,
				embeddingDim: EMBEDDING_DIMENSION,
				gcsUri,
				partWindows: PART_WINDOWS,
				// TODO(D12): if shouldEscalateToJudge per-part → llm_as_judge path
			});

			await Promise.all(
				partEmbeddings.map((pe) =>
					this.cacheEvaluationEmbedding(
						req.evaluationId,
						req.academyId,
						pe.embedding,
						pe.partIndex,
					),
				),
			);

			return analysis;
		} finally {
			// Always cleanup GCS staging — 1-day lifecycle 도 있지만 명시적.
			await this.deleteFromGcs(gcsObjectName).catch(() => {
				// best-effort cleanup; lifecycle 가 결국 처리.
			});
		}
	}

	private async downloadFromSupabase(path: string): Promise<Uint8Array> {
		const { data, error } = await this.deps.supabase.storage
			.from(STUDENT_VIDEOS_BUCKET)
			.download(path);
		if (error || !data) {
			throw new Error(
				`supabase_download_failed: ${error?.message ?? "unknown"}`,
			);
		}
		return new Uint8Array(await data.arrayBuffer());
	}

	private async getAccessToken(): Promise<string> {
		const client = await this.auth.getClient();
		const tokenResponse = await client.getAccessToken();
		if (!tokenResponse.token) {
			throw new Error("vertex_token_unavailable");
		}
		return tokenResponse.token;
	}

	private async uploadToGcs(
		objectName: string,
		bytes: Uint8Array,
	): Promise<void> {
		const token = await this.getAccessToken();
		const url = `https://storage.googleapis.com/upload/storage/v1/b/${
			this.deps.gcsVideoBucket
		}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "video/mp4",
			},
			// Web fetch BodyInit accepts BufferSource; cast Uint8Array view as
			// ArrayBufferView (TS narrows generic ArrayBufferLike too tightly here).
			body: bytes as unknown as BodyInit,
		});
		if (!res.ok) {
			throw new Error(`gcs_upload_failed: ${res.status} ${await res.text()}`);
		}
	}

	private async deleteFromGcs(objectName: string): Promise<void> {
		const token = await this.getAccessToken();
		const url = `https://storage.googleapis.com/storage/v1/b/${
			this.deps.gcsVideoBucket
		}/o/${encodeURIComponent(objectName)}`;
		await fetch(url, {
			method: "DELETE",
			headers: { Authorization: `Bearer ${token}` },
		});
	}

	private async callVertexEmbedding(
		gcsUri: string,
		window: PartWindow,
	): Promise<number[]> {
		const token = await this.getAccessToken();
		const url =
			`https://${this.deps.location}-aiplatform.googleapis.com/v1/projects/` +
			`${this.deps.projectId}/locations/${this.deps.location}/publishers/google/models/${VERTEX_MODEL}:predict`;
		const body = {
			instances: [
				{
					video: {
						gcsUri,
						videoSegmentConfig: {
							startOffsetSec: window.startOffsetSec,
							endOffsetSec: window.endOffsetSec,
						},
					},
				},
			],
			parameters: { dimension: EMBEDDING_DIMENSION },
		};
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			throw new Error(
				`vertex_predict_failed(part${window.partIndex}): ${res.status} ${await res.text()}`,
			);
		}
		const data = (await res.json()) as VertexPredictResponse;
		const segment = data.predictions?.[0]?.videoEmbeddings?.[0];
		if (
			!segment?.embedding ||
			segment.embedding.length !== EMBEDDING_DIMENSION
		) {
			throw new Error(
				`vertex_embedding_shape_unexpected(part${window.partIndex}): got ${
					segment?.embedding?.length ?? 0
				} dims`,
			);
		}
		return segment.embedding;
	}

	private async cosineSearchAllParts(
		partEmbeddings: PartEmbedding[],
		academyId: string,
	): Promise<PartMatchesByPart> {
		const entries = await Promise.all(
			partEmbeddings.map(
				async (pe) =>
					[
						pe.partIndex,
						await this.cosineSearchByPart(
							pe.embedding,
							academyId,
							pe.partIndex,
						),
					] as const,
			),
		);
		const byPart = Object.fromEntries(entries) as PartMatchesByPart;
		return {
			1: byPart[1] ?? [],
			2: byPart[2] ?? [],
			3: byPart[3] ?? [],
		};
	}

	private async cosineSearchByPart(
		vector: number[],
		academyId: string,
		partIndex: PartIndex,
	): Promise<ReferenceMatch[]> {
		const vectorLiteral = `[${vector.join(",")}]`;
		const rows = await this.deps.db.execute<CosineMatchRow>(
			sql`SELECT reference_video_id, tier, scene_type, cosine_similarity
			    FROM search_reference_matches_by_part(
			      ${vectorLiteral}::vector,
			      ${academyId}::uuid,
			      ${partIndex}::smallint,
			      5
			    )`,
		);
		return (rows as unknown as CosineMatchRow[]).map((r) => ({
			referenceVideoId: r.reference_video_id,
			tier: r.tier as "A" | "B" | "C" | "D",
			sceneType: r.scene_type,
			cosineScore: Number(r.cosine_similarity),
			partIndex,
		}));
	}

	private async cacheEvaluationEmbedding(
		evaluationId: string,
		academyId: string,
		vector: number[],
		partIndex: PartIndex,
	): Promise<void> {
		// embeddings 테이블은 schema.ts 에서 type-only (pgvector drizzle helper
		// 미적용) — raw SQL 사용. part_index 까지 같이 저장.
		const vectorLiteral = `[${vector.join(",")}]`;
		await this.deps.db.execute(
			sql`INSERT INTO embeddings (academy_id, source_type, source_evaluation_id, vector, part_index)
			    VALUES (
			      ${academyId}::uuid,
			      'evaluation',
			      ${evaluationId}::uuid,
			      ${vectorLiteral}::vector,
			      ${partIndex}::smallint
			    )`,
		);
	}
}
