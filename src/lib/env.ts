import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	server: {
		SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
		DATABASE_URL: z.string().url(),
		OPENAI_API_KEY: z.string().startsWith("sk-"),
		GOOGLE_VERTEX_PROJECT_ID: z.string().optional(),
		GOOGLE_VERTEX_LOCATION: z.string().default("asia-northeast1"),
		GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),
		GCS_VIDEO_BUCKET: z.string().optional(),
		KAKAO_OAUTH_CLIENT_ID: z.string().min(1),
		KAKAO_OAUTH_CLIENT_SECRET: z.string().min(1),
		SHARE_LINK_PEPPER: z.string().regex(/^[a-f0-9]{64}$/, "32-byte hex 필요"),
		FEATURE_AI_VIDEO_ANALYSIS: z.enum(["true", "false"]).default("false"),
		// B2C 소비자 인테이크 마스터 스위치 (변호사 사인오프 전 prod off — WS3.4).
		FEATURE_B2C_INTAKE_OPEN: z.enum(["true", "false"]).default("false"),
		// 보호자 본인인증 강도 게이트 (Phase A 는 자가입력 stub, provider 인터페이스는 v2).
		FEATURE_GUARDIAN_VERIFICATION: z.enum(["true", "false"]).default("false"),
	},
	client: {
		NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
		NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
		NEXT_PUBLIC_APP_URL: z.string().url(),
	},
	runtimeEnv: {
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		DATABASE_URL: process.env.DATABASE_URL,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		GOOGLE_VERTEX_PROJECT_ID: process.env.GOOGLE_VERTEX_PROJECT_ID,
		GOOGLE_VERTEX_LOCATION: process.env.GOOGLE_VERTEX_LOCATION,
		GOOGLE_APPLICATION_CREDENTIALS_JSON:
			process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
		GCS_VIDEO_BUCKET: process.env.GCS_VIDEO_BUCKET,
		KAKAO_OAUTH_CLIENT_ID: process.env.KAKAO_OAUTH_CLIENT_ID,
		KAKAO_OAUTH_CLIENT_SECRET: process.env.KAKAO_OAUTH_CLIENT_SECRET,
		SHARE_LINK_PEPPER: process.env.SHARE_LINK_PEPPER,
		FEATURE_AI_VIDEO_ANALYSIS: process.env.FEATURE_AI_VIDEO_ANALYSIS,
		FEATURE_B2C_INTAKE_OPEN: process.env.FEATURE_B2C_INTAKE_OPEN,
		FEATURE_GUARDIAN_VERIFICATION: process.env.FEATURE_GUARDIAN_VERIFICATION,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
	},
	emptyStringAsUndefined: true,
});
