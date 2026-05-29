import "server-only";
import { sql } from "drizzle-orm";
import { GoogleAuth } from "google-auth-library";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { STUDENT_VIDEOS_BUCKET } from "@/lib/evaluations/constants";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const VERTEX_MODEL = "multimodalembedding@001";
const EMBEDDING_DIMENSION = 1408;

type VertexPredictResponse = {
	predictions?: Array<{ videoEmbeddings?: Array<{ embedding: number[] }> }>;
};

function requireVertexEnv() {
	const projectId = env.GOOGLE_VERTEX_PROJECT_ID;
	const credentialsJson = env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
	const bucket = env.GCS_VIDEO_BUCKET;
	if (!projectId || !credentialsJson || !bucket) {
		throw new Error(
			"vertex_env_missing — GOOGLE_VERTEX_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS_JSON / GCS_VIDEO_BUCKET 필요",
		);
	}
	return {
		projectId,
		location: env.GOOGLE_VERTEX_LOCATION,
		credentialsJson,
		bucket,
	};
}

/**
 * Embed an already-uploaded reference clip and persist it.
 * Mirrors scripts/seed-reference-video.ts exactly (reference_videos + embeddings
 * with source_type='reference_video') so the cosine RPC keeps matching — but
 * reads bytes from Supabase Storage instead of a local file. The seed script is
 * NOT touched.
 */
export async function createReferenceFromStorage(input: {
	academyId: string;
	referenceId: string;
	storagePath: string; // path within STUDENT_VIDEOS_BUCKET
	tier: string;
	sceneType: string;
	techniqueTag: string | null;
}): Promise<void> {
	const v = requireVertexEnv();
	const auth = new GoogleAuth({
		credentials: JSON.parse(v.credentialsJson),
		scopes: ["https://www.googleapis.com/auth/cloud-platform"],
	});
	const client = await auth.getClient();
	const tokenRes = await client.getAccessToken();
	const token = tokenRes.token;
	if (!token) throw new Error("vertex_token_unavailable");

	// 1) read the uploaded clip from Supabase Storage
	const supabase = createServiceRoleClient();
	const dl = await supabase.storage
		.from(STUDENT_VIDEOS_BUCKET)
		.download(input.storagePath);
	if (dl.error || !dl.data)
		throw new Error(
			`storage_download_failed: ${dl.error?.message ?? "no_data"}`,
		);
	const bytes = new Uint8Array(await dl.data.arrayBuffer());

	// 2) stage to GCS so Vertex can read it via gs://
	const objectName = `reference-upload/${input.referenceId}.mp4`;
	const gcsUri = `gs://${v.bucket}/${objectName}`;
	const up = await fetch(
		`https://storage.googleapis.com/upload/storage/v1/b/${v.bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "video/mp4",
			},
			body: bytes as unknown as BodyInit,
		},
	);
	if (!up.ok) throw new Error(`gcs_upload_failed: ${up.status}`);

	try {
		// 3) Vertex multimodal embedding → 1408d
		const predictUrl =
			`https://${v.location}-aiplatform.googleapis.com/v1/projects/` +
			`${v.projectId}/locations/${v.location}/publishers/google/models/${VERTEX_MODEL}:predict`;
		const pred = await fetch(predictUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				instances: [
					{
						video: {
							gcsUri,
							videoSegmentConfig: { startOffsetSec: 0, endOffsetSec: 120 },
						},
					},
				],
				parameters: { dimension: EMBEDDING_DIMENSION },
			}),
		});
		if (!pred.ok)
			throw new Error(
				`vertex_predict_failed: ${pred.status} ${await pred.text()}`,
			);
		const data = (await pred.json()) as VertexPredictResponse;
		const embedding = data.predictions?.[0]?.videoEmbeddings?.[0]?.embedding;
		if (!embedding || embedding.length !== EMBEDDING_DIMENSION)
			throw new Error(
				`vertex_embedding_shape_unexpected: ${embedding?.length ?? 0} dims`,
			);

		// 4) persist (same shape as the seed → cosine RPC keeps working)
		const vectorLiteral = `[${embedding.join(",")}]`;
		await db.transaction(async (tx) => {
			await tx.execute(
				sql`INSERT INTO reference_videos (id, academy_id, level, scene_type, technique_tag, storage_url)
				    VALUES (${input.referenceId}::uuid, ${input.academyId}::uuid, ${input.tier}, ${input.sceneType}, ${input.techniqueTag}, ${input.storagePath})`,
			);
			await tx.execute(
				sql`INSERT INTO embeddings (academy_id, source_type, source_reference_video_id, vector)
				    VALUES (${input.academyId}::uuid, 'reference_video', ${input.referenceId}::uuid, ${vectorLiteral}::vector)`,
			);
		});
	} finally {
		// 5) cleanup GCS staging (lifecycle also covers it)
		await fetch(
			`https://storage.googleapis.com/storage/v1/b/${v.bucket}/o/${encodeURIComponent(objectName)}`,
			{ method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
		).catch(() => {});
	}
}
