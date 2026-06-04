// Shared GCS staging + GCP auth helpers.
//
// Extracted so both the multimodal-embedding path (vertex.ts) and the
// LLM-judge path (llm-judge.ts) reuse the SAME proven auth/upload/delete
// behavior that scripts/seed-reference-video.ts established. Dependency-light:
// only google-auth-library (already installed) + global fetch.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { GoogleAuth } from "google-auth-library";

// GoogleAuth → short-lived OAuth access token for the cloud-platform scope.
export async function getGcpToken(credentialsJson: string): Promise<string> {
	const auth = new GoogleAuth({
		credentials: JSON.parse(credentialsJson),
		scopes: ["https://www.googleapis.com/auth/cloud-platform"],
	});
	const client = await auth.getClient();
	const tokenResponse = await client.getAccessToken();
	if (!tokenResponse.token) throw new Error("gcp_token_failed");
	return tokenResponse.token;
}

// Upload raw bytes to a GCS object (media upload). Mirrors seed-reference-video.
export async function uploadToGcs(
	bucket: string,
	objectName: string,
	bytes: Uint8Array,
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
		// Web fetch BodyInit accepts BufferSource; cast the view (TS narrows the
		// generic ArrayBufferLike too tightly here).
		body: bytes as unknown as BodyInit,
	});
	if (!res.ok) {
		throw new Error(`gcs_upload_failed: ${res.status} ${await res.text()}`);
	}
}

// Best-effort delete of a staged GCS object. Callers should swallow errors in a
// finally (a bucket lifecycle rule is the backstop).
export async function deleteFromGcs(
	bucket: string,
	objectName: string,
	token: string,
): Promise<void> {
	const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(
		objectName,
	)}`;
	await fetch(url, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${token}` },
	});
}

export interface StagedVideo {
	gcsUri: string;
	bucket: string;
	objectName: string;
	token: string;
	sizeBytes: number;
}

// Convenience: read a local file from disk and stage it to GCS, returning the
// gs:// URI plus the metadata needed to clean it up later. The caller owns
// cleanup (call deleteFromGcs in a finally).
export async function stageLocalFileToGcs(
	filePath: string,
	bucket: string,
	credentialsJson: string,
	objectPrefix = "judge-staging",
): Promise<StagedVideo> {
	const bytes = await readFile(filePath);
	const token = await getGcpToken(credentialsJson);
	const objectName = `${objectPrefix}/${crypto.randomUUID()}-${basename(filePath)}`;
	await uploadToGcs(bucket, objectName, bytes, token);
	return {
		gcsUri: `gs://${bucket}/${objectName}`,
		bucket,
		objectName,
		token,
		sizeBytes: bytes.byteLength,
	};
}
