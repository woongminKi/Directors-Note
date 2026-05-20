import type { SupabaseClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { GoogleAuth } from "google-auth-library";
import type { db as DbClient } from "@/lib/db/client";
import { STUDENT_VIDEOS_BUCKET } from "@/lib/evaluations/upload-action";
import { buildAnalysisFromMatches } from "./grade-derivation";
import type {
	AIAnalysis,
	ProgressEvent,
	ReferenceMatch,
	VideoAnalysisRequest,
	VideoAnalysisService,
} from "./types";

// Vertex multimodalembedding@001 — video 모드는 1408d embedding 반환.
// API: <location>-aiplatform.googleapis.com/v1/projects/<project>/locations/<location>/publishers/google/models/multimodalembedding@001:predict
//
// 지원 리전: us-central1, europe-west4, asia-northeast1 (Tokyo).
// 영상 입력: gs:// URI 만 (inline base64 는 ≤4MB 라 실용 불가).
// 호출당 비용: ~0.001 USD per 10-second segment.

const VERTEX_MODEL = "multimodalembedding@001";
const EMBEDDING_DIMENSION = 1408;

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

			// STEP 2: Vertex multimodal embedding
			const embedding = await this.callVertexEmbedding(gcsUri);
			onProgress({
				step: "embedding_generated",
				vectorPreview: embedding.slice(0, 10),
			});

			// STEP 3: pgvector cosine search vs academy reference set
			const matches = await this.cosineSearch(embedding, req.academyId);
			onProgress({ step: "matches_computed", matches });

			// STEP 4: derive analysis (axes/grade) + cache embedding
			const analysis = buildAnalysisFromMatches(matches, {
				vertexModel: VERTEX_MODEL,
				embeddingDim: embedding.length,
				gcsUri,
				topMatch: matches[0] ?? null,
				// TODO(D12): if shouldEscalateToJudge(matches) → llm_as_judge path
			});

			await this.cacheEvaluationEmbedding(
				req.evaluationId,
				req.academyId,
				embedding,
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

	private async callVertexEmbedding(gcsUri: string): Promise<number[]> {
		const token = await this.getAccessToken();
		const url =
			`https://${this.deps.location}-aiplatform.googleapis.com/v1/projects/` +
			`${this.deps.projectId}/locations/${this.deps.location}/publishers/google/models/${VERTEX_MODEL}:predict`;
		const body = {
			instances: [
				{
					video: {
						gcsUri,
						videoSegmentConfig: { startOffsetSec: 0, endOffsetSec: 120 },
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
				`vertex_predict_failed: ${res.status} ${await res.text()}`,
			);
		}
		const data = (await res.json()) as VertexPredictResponse;
		const segment = data.predictions?.[0]?.videoEmbeddings?.[0];
		if (
			!segment?.embedding ||
			segment.embedding.length !== EMBEDDING_DIMENSION
		) {
			throw new Error(
				`vertex_embedding_shape_unexpected: got ${
					segment?.embedding?.length ?? 0
				} dims`,
			);
		}
		return segment.embedding;
	}

	private async cosineSearch(
		vector: number[],
		academyId: string,
	): Promise<ReferenceMatch[]> {
		const vectorLiteral = `[${vector.join(",")}]`;
		const rows = await this.deps.db.execute<CosineMatchRow>(
			sql`SELECT reference_video_id, tier, scene_type, cosine_similarity
			    FROM search_reference_matches(
			      ${vectorLiteral}::vector,
			      ${academyId}::uuid,
			      5
			    )`,
		);
		return (rows as unknown as CosineMatchRow[]).map((r) => ({
			referenceVideoId: r.reference_video_id,
			tier: r.tier as "A" | "B" | "C" | "D",
			sceneType: r.scene_type,
			cosineScore: Number(r.cosine_similarity),
		}));
	}

	private async cacheEvaluationEmbedding(
		evaluationId: string,
		academyId: string,
		vector: number[],
	): Promise<void> {
		// embeddings 테이블은 schema.ts 에서 type-only (pgvector drizzle helper
		// 미적용) — raw SQL 사용. ON CONFLICT 는 unique constraint 가 없어 생략;
		// duplicate insert 는 caller 가 idempotency 책임.
		const vectorLiteral = `[${vector.join(",")}]`;
		await this.deps.db.execute(
			sql`INSERT INTO embeddings (academy_id, source_type, source_evaluation_id, vector)
			    VALUES (${academyId}::uuid, 'evaluation', ${evaluationId}::uuid, ${vectorLiteral}::vector)`,
		);
	}
}
