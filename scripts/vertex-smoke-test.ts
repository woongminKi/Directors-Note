#!/usr/bin/env bun
/**
 * Vertex multimodal embedding 실제 호출 smoke test.
 *
 * Usage:
 *   bun run scripts/vertex-smoke-test.ts <path-to-sample.mp4>
 *
 * 동작:
 *   1) 로컬 mp4 파일 읽기
 *   2) GCS staging 버킷에 업로드 (smoketest/<timestamp>.mp4)
 *   3) Vertex multimodalembedding@001 :predict 호출
 *   4) embedding stats 출력 (length, l2 norm, first 10 dims)
 *   5) GCS 객체 삭제
 *
 * 비용: ≈ 0.001 USD (10초 segment) — 무시 가능.
 *
 * 자격증명: .env.local 의 GOOGLE_VERTEX_PROJECT_ID,
 *   GOOGLE_VERTEX_LOCATION, GOOGLE_APPLICATION_CREDENTIALS_JSON,
 *   GCS_VIDEO_BUCKET 모두 필요.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

interface SmokeEnv {
	projectId: string;
	location: string;
	credentialsJson: string;
	bucket: string;
}

function loadEnv(): SmokeEnv {
	const missing: string[] = [];
	const get = (k: string): string => {
		const v = process.env[k];
		if (!v) {
			missing.push(k);
			return "";
		}
		return v;
	};
	const env: SmokeEnv = {
		projectId: get("GOOGLE_VERTEX_PROJECT_ID"),
		location: get("GOOGLE_VERTEX_LOCATION"),
		credentialsJson: get("GOOGLE_APPLICATION_CREDENTIALS_JSON"),
		bucket: get("GCS_VIDEO_BUCKET"),
	};
	if (missing.length > 0) {
		console.error(
			`Missing env vars: ${missing.join(", ")}\n` +
				"Run from project root with .env.local sourced:\n" +
				"  bun --env-file=.env.local run scripts/vertex-smoke-test.ts ./sample.mp4",
		);
		process.exit(1);
	}
	return env;
}

async function main() {
	const argPath = process.argv[2];
	if (!argPath) {
		console.error("Usage: bun run scripts/vertex-smoke-test.ts <path-to-mp4>");
		process.exit(1);
	}
	const env = loadEnv();
	const filePath = resolve(argPath);
	console.log(`Reading ${filePath}`);
	const bytes = await readFile(filePath);
	console.log(`File size: ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`);

	const auth = new GoogleAuth({
		credentials: JSON.parse(env.credentialsJson),
		scopes: ["https://www.googleapis.com/auth/cloud-platform"],
	});
	const client = await auth.getClient();
	const tokenResponse = await client.getAccessToken();
	if (!tokenResponse.token) throw new Error("token_failed");
	const token = tokenResponse.token;

	const objectName = `smoketest/${Date.now()}.mp4`;
	const gcsUri = `gs://${env.bucket}/${objectName}`;
	console.log(`Uploading to ${gcsUri}`);

	const uploadRes = await fetch(
		`https://storage.googleapis.com/upload/storage/v1/b/${env.bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "video/mp4",
			},
			body: bytes as unknown as BodyInit,
		},
	);
	if (!uploadRes.ok) {
		console.error(`GCS upload failed: ${uploadRes.status}`);
		console.error(await uploadRes.text());
		process.exit(2);
	}
	console.log("✅ GCS upload OK");

	console.log(`Calling Vertex multimodalembedding@001 (${env.location})`);
	const predictUrl =
		`https://${env.location}-aiplatform.googleapis.com/v1/projects/` +
		`${env.projectId}/locations/${env.location}/publishers/google/models/multimodalembedding@001:predict`;
	const t0 = Date.now();
	const predictRes = await fetch(predictUrl, {
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
	const elapsedMs = Date.now() - t0;

	if (!predictRes.ok) {
		console.error(`Vertex predict failed: ${predictRes.status}`);
		console.error(await predictRes.text());
		await cleanup(env, objectName, token);
		process.exit(3);
	}

	const data = (await predictRes.json()) as {
		predictions?: Array<{
			videoEmbeddings?: Array<{ embedding: number[] }>;
		}>;
	};
	const embedding = data.predictions?.[0]?.videoEmbeddings?.[0]?.embedding;
	if (!embedding) {
		console.error("Unexpected response shape:", JSON.stringify(data).slice(0, 400));
		await cleanup(env, objectName, token);
		process.exit(4);
	}

	const l2 = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0));
	console.log("✅ Vertex predict OK");
	console.log(`   elapsed:        ${elapsedMs} ms`);
	console.log(`   embedding dims: ${embedding.length}`);
	console.log(`   l2 norm:        ${l2.toFixed(6)}`);
	console.log(`   first 10:       [${embedding.slice(0, 10).map((x) => x.toFixed(4)).join(", ")}]`);

	await cleanup(env, objectName, token);
	console.log("✅ Smoke test complete");
}

async function cleanup(env: SmokeEnv, objectName: string, token: string) {
	const url = `https://storage.googleapis.com/storage/v1/b/${env.bucket}/o/${encodeURIComponent(objectName)}`;
	const res = await fetch(url, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${token}` },
	});
	if (res.ok) {
		console.log("✅ GCS cleanup OK");
	} else {
		console.warn(`⚠️  GCS cleanup failed: ${res.status} (lifecycle rule will eventually delete)`);
	}
}

main().catch((err) => {
	console.error("ERR:", err);
	process.exit(99);
});
