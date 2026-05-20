#!/usr/bin/env bun
/**
 * Reference video 시드 스크립트.
 *
 * 학원의 gold-standard 시연 영상 한 개를 등록 + Vertex multimodal embedding
 * 캐시. 학생 영상 분석 시 cosine 매칭의 reference set 을 채움.
 *
 * Usage:
 *   bun run scripts/seed-reference-video.ts \
 *     --academy <uuid> \
 *     --tier A|B|C|D \
 *     --scene-type classical_monologue|modern_monologue|improv|... \
 *     --file ./path/to/reference.mp4 \
 *     [--technique-tag "발성, 표정"]
 *
 * 워크플로:
 *   1) 로컬 mp4 읽기
 *   2) Supabase Storage 업로드 (student-videos 버킷, reference/ prefix)
 *   3) GCS staging 업로드 (Vertex 가 읽을 gs:// URI 생성)
 *   4) Vertex multimodalembedding@001 호출 → 1408d
 *   5) Transaction: reference_videos + embeddings INSERT
 *   6) GCS staging 삭제 (lifecycle 도 있지만 명시적 cleanup)
 *
 * 비용: ≈ 0.001 USD per video. 학원당 10-20개 reference 면 1-2 cents.
 *
 * 멱등성 X: 같은 영상 두 번 실행하면 두 row 생김. 중복 관리는 caller 책임.
 *   (academy 운영 시점에 DB 직접 확인 → 삭제로 처리.)
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { GoogleAuth } from "google-auth-library";
import postgres from "postgres";

interface CliArgs {
	academyId: string;
	tier: "A" | "B" | "C" | "D";
	sceneType: string;
	filePath: string;
	techniqueTag: string | null;
}

interface SeedEnv {
	supabaseUrl: string;
	serviceRoleKey: string;
	databaseUrl: string;
	gcpProjectId: string;
	gcpLocation: string;
	gcpCredentialsJson: string;
	gcsBucket: string;
}

const STORAGE_BUCKET = "student-videos";
const VERTEX_MODEL = "multimodalembedding@001";

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const get = (flag: string): string | null => {
		const i = args.indexOf(flag);
		return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
	};
	const academyId = get("--academy");
	const tier = get("--tier");
	const sceneType = get("--scene-type");
	const filePath = get("--file");
	const techniqueTag = get("--technique-tag");

	if (!academyId || !tier || !sceneType || !filePath) {
		console.error(
			"Usage: seed-reference-video.ts --academy <uuid> --tier A|B|C|D --scene-type <str> --file <path.mp4> [--technique-tag <str>]",
		);
		process.exit(1);
	}
	if (!["A", "B", "C", "D"].includes(tier)) {
		console.error(`tier must be A|B|C|D, got: ${tier}`);
		process.exit(1);
	}
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			academyId,
		)
	) {
		console.error(`academy must be UUID, got: ${academyId}`);
		process.exit(1);
	}
	return {
		academyId,
		tier: tier as "A" | "B" | "C" | "D",
		sceneType,
		filePath,
		techniqueTag,
	};
}

function loadEnv(): SeedEnv {
	const missing: string[] = [];
	const get = (k: string): string => {
		const v = process.env[k];
		if (!v) {
			missing.push(k);
			return "";
		}
		return v;
	};
	const env: SeedEnv = {
		supabaseUrl: get("NEXT_PUBLIC_SUPABASE_URL"),
		serviceRoleKey: get("SUPABASE_SERVICE_ROLE_KEY"),
		databaseUrl: get("DATABASE_URL"),
		gcpProjectId: get("GOOGLE_VERTEX_PROJECT_ID"),
		gcpLocation: get("GOOGLE_VERTEX_LOCATION"),
		gcpCredentialsJson: get("GOOGLE_APPLICATION_CREDENTIALS_JSON"),
		gcsBucket: get("GCS_VIDEO_BUCKET"),
	};
	if (missing.length > 0) {
		console.error(`Missing env vars: ${missing.join(", ")}`);
		process.exit(1);
	}
	return env;
}

async function getGcpToken(credentialsJson: string): Promise<string> {
	const auth = new GoogleAuth({
		credentials: JSON.parse(credentialsJson),
		scopes: ["https://www.googleapis.com/auth/cloud-platform"],
	});
	const client = await auth.getClient();
	const tokenResponse = await client.getAccessToken();
	if (!tokenResponse.token) throw new Error("gcp_token_failed");
	return tokenResponse.token;
}

async function uploadToGcs(
	bucket: string,
	objectName: string,
	bytes: Buffer,
	token: string,
): Promise<void> {
	const url =
		`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o` +
		`?uploadType=media&name=${encodeURIComponent(objectName)}`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "video/mp4",
		},
		body: bytes as unknown as BodyInit,
	});
	if (!res.ok) {
		throw new Error(`gcs_upload_failed: ${res.status} ${await res.text()}`);
	}
}

async function deleteFromGcs(
	bucket: string,
	objectName: string,
	token: string,
): Promise<void> {
	const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}`;
	await fetch(url, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${token}` },
	});
}

async function callVertex(
	gcsUri: string,
	env: SeedEnv,
	token: string,
): Promise<number[]> {
	const url =
		`https://${env.gcpLocation}-aiplatform.googleapis.com/v1/projects/` +
		`${env.gcpProjectId}/locations/${env.gcpLocation}/publishers/google/models/${VERTEX_MODEL}:predict`;
	const res = await fetch(url, {
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
			parameters: { dimension: 1408 },
		}),
	});
	if (!res.ok) {
		throw new Error(`vertex_predict_failed: ${res.status} ${await res.text()}`);
	}
	const data = (await res.json()) as {
		predictions?: Array<{
			videoEmbeddings?: Array<{ embedding: number[] }>;
		}>;
	};
	const embedding = data.predictions?.[0]?.videoEmbeddings?.[0]?.embedding;
	if (!embedding || embedding.length !== 1408) {
		throw new Error(
			`vertex_embedding_shape_unexpected: got ${embedding?.length ?? 0} dims`,
		);
	}
	return embedding;
}

async function main() {
	const args = parseArgs();
	const env = loadEnv();
	const fullPath = resolve(args.filePath);
	console.log(`Reading ${fullPath}`);
	const bytes = await readFile(fullPath);
	console.log(`File size: ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`);

	const referenceId = crypto.randomUUID();
	const storagePath = `${args.academyId}/reference/${referenceId}.mp4`;
	const gcsObjectName = `reference-seed/${referenceId}.mp4`;

	// Supabase Storage upload (service-role bypasses RLS)
	const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	console.log(`Uploading to Supabase Storage: ${storagePath}`);
	const { error: uploadError } = await supabase.storage
		.from(STORAGE_BUCKET)
		.upload(storagePath, bytes, {
			contentType: "video/mp4",
			upsert: false,
		});
	if (uploadError) {
		throw new Error(`supabase_storage_upload_failed: ${uploadError.message}`);
	}
	console.log("✅ Supabase upload OK");

	// GCS staging upload + Vertex predict
	const token = await getGcpToken(env.gcpCredentialsJson);
	const gcsUri = `gs://${env.gcsBucket}/${gcsObjectName}`;
	console.log(`Uploading to GCS staging: ${gcsUri}`);
	await uploadToGcs(env.gcsBucket, gcsObjectName, bytes, token);
	console.log("✅ GCS staging OK");

	console.log("Calling Vertex multimodalembedding@001 ...");
	let embedding: number[];
	try {
		embedding = await callVertex(gcsUri, env, token);
	} finally {
		await deleteFromGcs(env.gcsBucket, gcsObjectName, token).catch(() => {});
	}
	const l2 = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0));
	console.log(
		`✅ Vertex predict OK (dims=${embedding.length}, l2=${l2.toFixed(4)})`,
	);

	// DB INSERT — transaction (reference_videos + embeddings together)
	const pg = postgres(env.databaseUrl, { prepare: false, max: 3 });
	const db = drizzle(pg);
	const vectorLiteral = `[${embedding.join(",")}]`;

	try {
		await db.transaction(async (tx) => {
			await tx.execute(
				sql`INSERT INTO reference_videos (id, academy_id, level, scene_type, technique_tag, storage_url)
				    VALUES (
				      ${referenceId}::uuid,
				      ${args.academyId}::uuid,
				      ${args.tier},
				      ${args.sceneType},
				      ${args.techniqueTag},
				      ${storagePath}
				    )`,
			);
			await tx.execute(
				sql`INSERT INTO embeddings (academy_id, source_type, source_reference_video_id, vector)
				    VALUES (
				      ${args.academyId}::uuid,
				      'reference_video',
				      ${referenceId}::uuid,
				      ${vectorLiteral}::vector
				    )`,
			);
		});
		console.log(`✅ DB INSERT OK — reference_video.id=${referenceId}`);
	} finally {
		await pg.end({ timeout: 5 });
	}

	console.log("");
	console.log(`🎉 Reference video seeded for academy ${args.academyId}`);
	console.log(`   tier:       ${args.tier}`);
	console.log(`   scene_type: ${args.sceneType}`);
	console.log(`   id:         ${referenceId}`);
	console.log(`   storage:    ${STORAGE_BUCKET}/${storagePath}`);
}

main().catch((err) => {
	console.error("ERR:", err);
	process.exit(99);
});
