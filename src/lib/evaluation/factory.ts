import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { GPT4oMiniLetterService } from "./gpt-4o-mini-letter";
import { StubVideoAnalysisService } from "./stub";
import type { LetterGenerationService, VideoAnalysisService } from "./types";
import { VertexVideoAnalysisService } from "./vertex";

/**
 * VideoAnalysisService 팩토리.
 * - feature flag off → throw (UI 가 Approach-A 폼으로 라우팅)
 * - flag on + Vertex 자격증명 완비 → Vertex
 * - flag on + dev + 자격증명 누락 → Stub (실제 호출 없이 UI 검증 가능)
 * - flag on + non-dev + 자격증명 누락 → throw
 */
export function createVideoAnalysisService(): VideoAnalysisService {
	if (env.FEATURE_AI_VIDEO_ANALYSIS === "false") {
		throw new Error(
			"VideoAnalysisService not available — FEATURE_AI_VIDEO_ANALYSIS=false. UI should render <CoachBulletForm/> instead of <VideoUploadFlow/>.",
		);
	}

	const isDev = process.env.NODE_ENV === "development";
	const hasVertex =
		!!env.GOOGLE_VERTEX_PROJECT_ID &&
		!!env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
		!!env.GCS_VIDEO_BUCKET;

	if (hasVertex) {
		return new VertexVideoAnalysisService({
			projectId: env.GOOGLE_VERTEX_PROJECT_ID as string,
			location: env.GOOGLE_VERTEX_LOCATION,
			credentialsJson: env.GOOGLE_APPLICATION_CREDENTIALS_JSON as string,
			gcsVideoBucket: env.GCS_VIDEO_BUCKET as string,
			supabase: createServiceRoleClient(),
			db,
		});
	}

	if (isDev) {
		return new StubVideoAnalysisService();
	}

	throw new Error(
		"Vertex credentials missing in non-development env — set GOOGLE_VERTEX_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON, GCS_VIDEO_BUCKET",
	);
}

/**
 * LetterGenerationService 팩토리.
 * v1: gpt-4o-mini 직접 fetch.
 * v2 후보: HyperCLOVA / Solar / Claude direct.
 */
export function createLetterGenerationService(): LetterGenerationService {
	return new GPT4oMiniLetterService(env.OPENAI_API_KEY);
}
