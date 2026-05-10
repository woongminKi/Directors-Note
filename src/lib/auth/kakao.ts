"use client";
import { createClient } from "@/lib/supabase/client";

export async function signInWithKakao(redirectTo?: string) {
	const supabase = createClient();
	const next = redirectTo ?? "/students";
	await supabase.auth.signInWithOAuth({
		provider: "kakao",
		options: {
			redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
		},
	});
}
