import { env } from "@/lib/env";
import { GPT4oMiniLetterService } from "./gpt-4o-mini-letter";
import { StubVideoAnalysisService } from "./stub";
import type { LetterGenerationService, VideoAnalysisService } from "./types";

/**
 * VideoAnalysisService 팩토리.
 * - feature flag off → 호출 시 throw (UI 가 Approach-A 폼으로 라우팅)
 * - dev + Vertex creds 없음 → Stub
 * - production / staging → Vertex (PIPA 의견 후 채워짐)
 */
export function createVideoAnalysisService(): VideoAnalysisService {
	if (env.FEATURE_AI_VIDEO_ANALYSIS === "false") {
		throw new Error(
			"VideoAnalysisService not available — FEATURE_AI_VIDEO_ANALYSIS=false. UI should render <CoachBulletForm/> instead of <VideoUploadFlow/>.",
		);
	}

	const isDev = process.env.NODE_ENV === "development";
	const hasVertex = !!env.GOOGLE_VERTEX_PROJECT_ID && !!env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

	if (isDev && !hasVertex) {
		return new StubVideoAnalysisService();
	}

	if (!hasVertex) {
		throw new Error("Vertex credentials missing in non-development env");
	}

	// VertexVideoAnalysisService 는 PIPA 의견 후 구현 (D6 게이트).
	throw new Error(
		"VertexVideoAnalysisService not implemented — PIPA opinion gate. " +
			"Add credentials and implement vertex.ts after legal review.",
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
