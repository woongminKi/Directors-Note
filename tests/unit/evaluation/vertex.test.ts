import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock google-auth-library before importing vertex.ts. Class-based so
// `new GoogleAuth(...)` works.
vi.mock("google-auth-library", () => ({
	GoogleAuth: class {
		async getClient() {
			return {
				getAccessToken: async () => ({ token: "fake-oauth-token" }),
			};
		}
	},
}));

// Mock STUDENT_VIDEOS_BUCKET import (avoids server-only chain).
vi.mock("@/lib/evaluations/upload-action", () => ({
	STUDENT_VIDEOS_BUCKET: "student-videos",
}));

import { VertexVideoAnalysisService } from "@/lib/evaluation/vertex";
import type { ProgressEvent } from "@/lib/evaluation/types";

const FAKE_EMBEDDING = Array.from({ length: 1408 }, (_, i) => Math.sin(i / 100));

const FAKE_CREDS_JSON = JSON.stringify({
	type: "service_account",
	project_id: "test-project",
	private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
	client_email: "test@test.iam.gserviceaccount.com",
});

interface MockSupabase {
	storage: {
		from: ReturnType<typeof vi.fn>;
	};
}

interface MockDb {
	execute: ReturnType<typeof vi.fn>;
}

function makeFakeSupabase(downloadOk = true): MockSupabase {
	const arrayBuffer = async () => new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
	return {
		storage: {
			from: vi.fn().mockReturnValue({
				download: vi.fn().mockResolvedValue(
					downloadOk
						? { data: { arrayBuffer }, error: null }
						: { data: null, error: { message: "boom" } },
				),
			}),
		},
	};
}

function makeFakeDb(
	matchRows: Array<Record<string, unknown>> = [
		{
			reference_video_id: "11111111-1111-4000-8000-000000000001",
			tier: "A",
			scene_type: "classical_monologue",
			cosine_similarity: "0.91",
		},
		{
			reference_video_id: "22222222-2222-4000-8000-000000000002",
			tier: "B",
			scene_type: "modern_monologue",
			cosine_similarity: "0.78",
		},
	],
): MockDb {
	let call = 0;
	return {
		execute: vi.fn().mockImplementation(async () => {
			call++;
			// 1st execute = cosine search (returns rows); 2nd = insert (returns nothing)
			return call === 1 ? matchRows : [];
		}),
	};
}

function makeDeps(overrides: {
	supabase?: MockSupabase;
	db?: MockDb;
} = {}) {
	return {
		projectId: "test-project",
		location: "asia-northeast1",
		credentialsJson: FAKE_CREDS_JSON,
		gcsVideoBucket: "test-bucket",
		supabase: (overrides.supabase ?? makeFakeSupabase()) as never,
		db: (overrides.db ?? makeFakeDb()) as never,
	};
}

function makeFetchMock(opts: {
	vertexOk?: boolean;
	gcsUploadOk?: boolean;
	gcsDeleteOk?: boolean;
} = {}) {
	const { vertexOk = true, gcsUploadOk = true, gcsDeleteOk = true } = opts;
	const calls: string[] = [];
	const mock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
		calls.push(`${init?.method ?? "GET"} ${url}`);
		if (url.includes("upload/storage/v1")) {
			return new Response(gcsUploadOk ? "{}" : "fail", {
				status: gcsUploadOk ? 200 : 500,
			});
		}
		if (url.includes("aiplatform.googleapis.com")) {
			if (!vertexOk) return new Response("vertex fail", { status: 500 });
			return new Response(
				JSON.stringify({
					predictions: [
						{
							videoEmbeddings: [
								{ embedding: FAKE_EMBEDDING, startOffsetSec: 0, endOffsetSec: 120 },
							],
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		if (url.includes("storage/v1/b/") && init?.method === "DELETE") {
			return new Response("", { status: gcsDeleteOk ? 204 : 500 });
		}
		return new Response("unhandled", { status: 404 });
	});
	return { mock, calls };
}

describe("VertexVideoAnalysisService", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("happy path: emits frames_extracted → embedding_generated → matches_computed in order", async () => {
		const { mock } = makeFetchMock();
		vi.stubGlobal("fetch", mock);

		const svc = new VertexVideoAnalysisService(makeDeps());
		const events: ProgressEvent[] = [];

		const analysis = await svc.analyzeStreaming(
			{
				evaluationId: "aaaaaaaa-aaaa-4000-8000-000000000aaa",
				academyId: "bbbbbbbb-bbbb-4000-8000-000000000bbb",
				studentVideoUrl: "bbbbbbbb-bbbb-4000-8000-000000000bbb/eval.mp4",
			},
			(e) => events.push(e),
		);

		expect(events.map((e) => e.step)).toEqual([
			"frames_extracted",
			"embedding_generated",
			"matches_computed",
		]);
		expect(analysis.internalGrade).toBe("A");
		expect(analysis.calibrationMatchScore).toBe(0.91);
		expect(analysis.evaluatorUsed).toBe("cosine");
		expect(analysis.topMatches).toHaveLength(2);
	});

	it("vectorPreview is first 10 dims of the 1408d embedding", async () => {
		const { mock } = makeFetchMock();
		vi.stubGlobal("fetch", mock);
		const svc = new VertexVideoAnalysisService(makeDeps());
		const events: ProgressEvent[] = [];
		await svc.analyzeStreaming(
			{
				evaluationId: "aaaaaaaa-aaaa-4000-8000-000000000aaa",
				academyId: "bbbbbbbb-bbbb-4000-8000-000000000bbb",
				studentVideoUrl: "bbbbbbbb-bbbb-4000-8000-000000000bbb/eval.mp4",
			},
			(e) => events.push(e),
		);
		const previewEvent = events.find((e) => e.step === "embedding_generated");
		if (previewEvent?.step !== "embedding_generated")
			throw new Error("missing preview event");
		expect(previewEvent.vectorPreview).toHaveLength(10);
		expect(previewEvent.vectorPreview[0]).toBeCloseTo(FAKE_EMBEDDING[0]);
	});

	it("calls Vertex with gs://<bucket>/<academy>/<eval>.mp4 URI", async () => {
		const { mock, calls } = makeFetchMock();
		vi.stubGlobal("fetch", mock);
		const svc = new VertexVideoAnalysisService(makeDeps());
		await svc.analyzeStreaming(
			{
				evaluationId: "aaaaaaaa-aaaa-4000-8000-000000000aaa",
				academyId: "bbbbbbbb-bbbb-4000-8000-000000000bbb",
				studentVideoUrl: "bbbbbbbb-bbbb-4000-8000-000000000bbb/eval.mp4",
			},
			() => {},
		);
		const vertexCall = mock.mock.calls.find(([url]) =>
			String(url).includes("aiplatform.googleapis.com"),
		);
		expect(vertexCall).toBeDefined();
		const body = JSON.parse(String(vertexCall?.[1]?.body));
		expect(body.instances[0].video.gcsUri).toBe(
			"gs://test-bucket/bbbbbbbb-bbbb-4000-8000-000000000bbb/aaaaaaaa-aaaa-4000-8000-000000000aaa.mp4",
		);
		expect(body.parameters.dimension).toBe(1408);
		expect(
			calls.some((c) => c.startsWith("DELETE") && c.includes("storage/v1")),
		).toBe(true);
	});

	it("cleans up GCS staging even when Vertex predict fails", async () => {
		const { mock, calls } = makeFetchMock({ vertexOk: false });
		vi.stubGlobal("fetch", mock);
		const svc = new VertexVideoAnalysisService(makeDeps());
		await expect(
			svc.analyzeStreaming(
				{
					evaluationId: "aaaaaaaa-aaaa-4000-8000-000000000aaa",
					academyId: "bbbbbbbb-bbbb-4000-8000-000000000bbb",
					studentVideoUrl: "bbbbbbbb-bbbb-4000-8000-000000000bbb/eval.mp4",
				},
				() => {},
			),
		).rejects.toThrow(/vertex_predict_failed/);
		expect(
			calls.some((c) => c.startsWith("DELETE") && c.includes("storage/v1")),
		).toBe(true);
	});

	it("throws when no reference matches (empty academy reference set)", async () => {
		const { mock } = makeFetchMock();
		vi.stubGlobal("fetch", mock);
		const svc = new VertexVideoAnalysisService(
			makeDeps({ db: makeFakeDb([]) }),
		);
		await expect(
			svc.analyzeStreaming(
				{
					evaluationId: "aaaaaaaa-aaaa-4000-8000-000000000aaa",
					academyId: "bbbbbbbb-bbbb-4000-8000-000000000bbb",
					studentVideoUrl: "bbbbbbbb-bbbb-4000-8000-000000000bbb/eval.mp4",
				},
				() => {},
			),
		).rejects.toThrow(/no_reference_matches/);
	});

	it("throws when Supabase download fails", async () => {
		const { mock } = makeFetchMock();
		vi.stubGlobal("fetch", mock);
		const svc = new VertexVideoAnalysisService(
			makeDeps({ supabase: makeFakeSupabase(false) }),
		);
		await expect(
			svc.analyzeStreaming(
				{
					evaluationId: "aaaaaaaa-aaaa-4000-8000-000000000aaa",
					academyId: "bbbbbbbb-bbbb-4000-8000-000000000bbb",
					studentVideoUrl: "bbbbbbbb-bbbb-4000-8000-000000000bbb/eval.mp4",
				},
				() => {},
			),
		).rejects.toThrow(/supabase_download_failed/);
	});
});
