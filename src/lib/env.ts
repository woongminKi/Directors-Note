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
		KAKAO_OAUTH_CLIENT_ID: z.string().min(1),
		KAKAO_OAUTH_CLIENT_SECRET: z.string().min(1),
		SHARE_LINK_PEPPER: z.string().regex(/^[a-f0-9]{64}$/, "32-byte hex 필요"),
		FEATURE_AI_VIDEO_ANALYSIS: z.enum(["true", "false"]).default("false"),
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
		KAKAO_OAUTH_CLIENT_ID: process.env.KAKAO_OAUTH_CLIENT_ID,
		KAKAO_OAUTH_CLIENT_SECRET: process.env.KAKAO_OAUTH_CLIENT_SECRET,
		SHARE_LINK_PEPPER: process.env.SHARE_LINK_PEPPER,
		FEATURE_AI_VIDEO_ANALYSIS: process.env.FEATURE_AI_VIDEO_ANALYSIS,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
	},
	emptyStringAsUndefined: true,
});
