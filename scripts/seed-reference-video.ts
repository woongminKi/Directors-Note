#!/usr/bin/env bun
/**
 * Reference video 시드 스크립트 (v2 — 3파트 분할 임베딩).
 *
 * 학원의 평가 영상은 3파트 구조:
 *   - part 1 (0-90s):    자유 연기
 *   - part 2 (90-150s):  무용 또는 노래
 *   - part 3 (150s~):    압박 면접
 *
 * v1 (0-120s 단일 임베딩) 의 한계 — 후반 파트가 임베딩에 포함되지 않음 — 를
 * 해결. 1 영상 → Vertex 3회 호출 → 1408d 임베딩 3개 → DB 에 part_index 1/2/3
 * 로 저장.
 *
 * Usage:
 *   bun run scripts/seed-reference-video.ts \
 *     --academy <uuid> \
 *     --tier A|B|C|D \
 *     --scene-type classical_monologue|modern_monologue|improv|... \
 *     --file ./path/to/reference.mp4 \
 *     [--technique-tag "발성, 표정"]
 *
 * 비용: ≈ 0.001 USD × 3 = ≈ 0.003 USD per video.
 *
 * 의존성: ffprobe (영상 길이 측정용). brew install ffmpeg.
 */

import { spawn } from "node:child_process";
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

interface PartWindow {
	partIndex: 1 | 2 | 3;
	startOffsetSec: number;
	endOffsetSec: number;
}

const STORAGE_BUCKET = "student-videos";
const VERTEX_MODEL = "multimodalembedding@001";
const EMBEDDING_DIMENSION = 1408;

// 3파트 경계 (도메인 지식).
const PART1_END = 90;
const PART2_END = 150;
// Vertex multimodalembedding@001 segment max 120s — part3 은 150~min(duration, 270).

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

async function probeDurationSec(filePath: string): Promise<number> {
	return await new Promise<number>((res, rej) => {
		const proc = spawn(
			"ffprobe",
			[
				"-v",
				"error",
				"-show_entries",
				"format=duration",
				"-of",
				"default=noprint_wrappers=1:nokey=1",
				filePath,
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let out = "";
		let err = "";
		proc.stdout.on("data", (d) => {
			out += d.toString();
		});
		proc.stderr.on("data", (d) => {
			err += d.toString();
		});
		proc.on("close", (code) => {
			if (code !== 0) {
				rej(new Error(`ffprobe_failed(${code}): ${err.trim()}`));
				return;
			}
			const dur = Number.parseFloat(out.trim());
			if (!Number.isFinite(dur) || dur <= 0) {
				rej(new Error(`ffprobe_invalid_duration: ${out.trim()}`));
				return;
			}
			res(dur);
		});
	});
}

function buildPartWindows(durationSec: number): PartWindow[] {
	if (durationSec <= PART2_END + 4) {
		// part3 최소 4s 안 됨 — 도메인 가정 위반. 명시적 에러.
		throw new Error(
			`video_too_short_for_3_parts: duration=${durationSec.toFixed(1)}s, need > ${PART2_END + 4}s`,
		);
	}
	const part3End = Math.min(durationSec, PART2_END + 120); // Vertex max segment 120s
	return [
		{ partIndex: 1, startOffsetSec: 0, endOffsetSec: PART1_END },
		{ partIndex: 2, startOffsetSec: PART1_END, endOffsetSec: PART2_END },
		{
			partIndex: 3,
			startOffsetSec: PART2_END,
			endOffsetSec: Math.floor(part3End),
		},
	];
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

async function callVertexForPart(
	gcsUri: string,
	env: SeedEnv,
	token: string,
	window: PartWindow,
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
						videoSegmentConfig: {
							startOffsetSec: window.startOffsetSec,
							endOffsetSec: window.endOffsetSec,
						},
					},
				},
			],
			parameters: { dimension: EMBEDDING_DIMENSION },
		}),
	});
	if (!res.ok) {
		throw new Error(
			`vertex_predict_failed(part${window.partIndex}): ${res.status} ${await res.text()}`,
		);
	}
	const data = (await res.json()) as {
		predictions?: Array<{
			videoEmbeddings?: Array<{ embedding: number[] }>;
		}>;
	};
	const embedding = data.predictions?.[0]?.videoEmbeddings?.[0]?.embedding;
	if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
		throw new Error(
			`vertex_embedding_shape_unexpected(part${window.partIndex}): got ${embedding?.length ?? 0} dims`,
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

	const durationSec = await probeDurationSec(fullPath);
	console.log(`Duration: ${durationSec.toFixed(1)}s`);
	const windows = buildPartWindows(durationSec);
	for (const w of windows) {
		console.log(
			`  part${w.partIndex}: ${w.startOffsetSec}-${w.endOffsetSec}s (${w.endOffsetSec - w.startOffsetSec}s)`,
		);
	}

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

	// GCS staging upload + Vertex predict (3 parts in parallel)
	const token = await getGcpToken(env.gcpCredentialsJson);
	const gcsUri = `gs://${env.gcsBucket}/${gcsObjectName}`;
	console.log(`Uploading to GCS staging: ${gcsUri}`);
	await uploadToGcs(env.gcsBucket, gcsObjectName, bytes, token);
	console.log("✅ GCS staging OK");

	console.log("Calling Vertex multimodalembedding@001 for 3 parts (parallel)...");
	let embeddings: Array<{ window: PartWindow; embedding: number[] }>;
	try {
		const t0 = Date.now();
		embeddings = await Promise.all(
			windows.map(async (w) => ({
				window: w,
				embedding: await callVertexForPart(gcsUri, env, token, w),
			})),
		);
		const dt = ((Date.now() - t0) / 1000).toFixed(1);
		console.log(`✅ Vertex predict OK (3 parts in ${dt}s)`);
	} finally {
		await deleteFromGcs(env.gcsBucket, gcsObjectName, token).catch(() => {});
	}

	for (const { window: w, embedding } of embeddings) {
		const l2 = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0));
		console.log(
			`  part${w.partIndex}: dims=${embedding.length}, l2=${l2.toFixed(4)}`,
		);
	}

	// DB INSERT — transaction (reference_videos + 3 embeddings together)
	const pg = postgres(env.databaseUrl, { prepare: false, max: 3 });
	const db = drizzle(pg);

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
			for (const { window: w, embedding } of embeddings) {
				const vectorLiteral = `[${embedding.join(",")}]`;
				await tx.execute(
					sql`INSERT INTO embeddings (academy_id, source_type, source_reference_video_id, vector, part_index)
					    VALUES (
					      ${args.academyId}::uuid,
					      'reference_video',
					      ${referenceId}::uuid,
					      ${vectorLiteral}::vector,
					      ${w.partIndex}
					    )`,
				);
			}
		});
		console.log(`✅ DB INSERT OK — reference_video.id=${referenceId} (3 embeddings)`);
	} finally {
		await pg.end({ timeout: 5 });
	}

	console.log("");
	console.log(`🎉 Reference video seeded for academy ${args.academyId}`);
	console.log(`   tier:       ${args.tier}`);
	console.log(`   scene_type: ${args.sceneType}`);
	console.log(`   id:         ${referenceId}`);
	console.log(`   storage:    ${STORAGE_BUCKET}/${storagePath}`);
	console.log(`   parts:      3 (1=자유연기, 2=무용/노래, 3=압박면접)`);
}

main().catch((err) => {
	console.error("ERR:", err);
	process.exit(99);
});
