/**
 * Generate Playwright `storageState` JSON files for the dev owner + coach.
 *
 * Why this isn't a magic-link follow:
 *   The Supabase project uses implicit-flow magic links (#access_token=...
 *   in URL hash). Our /auth/callback expects PKCE-style ?code=. Browser
 *   strips the hash before sending it to the server, so the callback
 *   redirects to /auth/not-invited even though the tokens are in the URL.
 *
 * The cleaner workaround: sign in via password grant (service-role sets
 *   dev passwords in seed-dev-tenant), receive the session JSON directly
 *   from Supabase REST, then encode it as the @supabase/ssr cookie format
 *   and write a Playwright storageState manually. Bypasses /auth/callback
 *   entirely — the resulting cookies authenticate every subsequent test.
 *
 * Production Kakao OAuth flow is unaffected; only dev users have passwords.
 *
 * Prerequisites:
 *   - Dev tenant seeded (`bun run db:seed-dev`) — sets dev passwords
 *
 * Run: bun run e2e:auth-setup
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
	console.error(
		"Missing env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.",
	);
	process.exit(1);
}

const DEV_PASSWORD = "Catharsis-dev-2026!"; // must match seed-dev-tenant.ts

const TARGETS = [
	{ role: "owner", email: "dev-owner@catharsis.test" },
	{ role: "coach", email: "dev-coach@catharsis.test" },
] as const;

// Project ref = subdomain of <ref>.supabase.co.
function projectRef(url: string): string {
	const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
	if (!m) throw new Error(`unrecognized Supabase URL: ${url}`);
	return m[1]!;
}

// Match @supabase/ssr's stringToBase64URL → URL-safe base64, no padding.
function base64UrlEncode(s: string): string {
	const utf8 = new TextEncoder().encode(s);
	let bin = "";
	for (const b of utf8) bin += String.fromCharCode(b);
	return btoa(bin)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

interface PasswordGrantResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	expires_at?: number;
	refresh_token: string;
	user: unknown;
}

async function signInWithPassword(
	email: string,
): Promise<PasswordGrantResponse> {
	const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			apikey: ANON_KEY!,
		},
		body: JSON.stringify({ email, password: DEV_PASSWORD }),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`password grant failed (${res.status}): ${body}`);
	}
	return (await res.json()) as PasswordGrantResponse;
}

function buildCookieValue(session: PasswordGrantResponse): string {
	// @supabase/ssr cookie value format: `base64-` prefix + base64url(JSON).
	// The JSON is the Session object expected by @supabase/supabase-js.
	const payload = JSON.stringify({
		access_token: session.access_token,
		token_type: session.token_type,
		expires_in: session.expires_in,
		expires_at:
			session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
		refresh_token: session.refresh_token,
		user: session.user,
	});
	return `base64-${base64UrlEncode(payload)}`;
}

interface PlaywrightCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	expires: number;
	httpOnly: boolean;
	secure: boolean;
	sameSite: "Lax" | "Strict" | "None";
}

function buildStorageState(
	cookieName: string,
	cookieValue: string,
	expiresAtSeconds: number,
	hostname: string,
): { cookies: PlaywrightCookie[]; origins: unknown[] } {
	// If the value is too long for one cookie, @supabase/ssr chunks at 3180.
	// Mirror that here so server-side reads can re-assemble.
	const CHUNK = 3180;
	const chunks: Array<{ name: string; value: string }> = [];
	if (cookieValue.length <= CHUNK) {
		chunks.push({ name: cookieName, value: cookieValue });
	} else {
		let i = 0;
		for (let pos = 0; pos < cookieValue.length; pos += CHUNK, i++) {
			chunks.push({
				name: `${cookieName}.${i}`,
				value: cookieValue.slice(pos, pos + CHUNK),
			});
		}
	}
	return {
		cookies: chunks.map((c) => ({
			name: c.name,
			value: c.value,
			domain: hostname,
			path: "/",
			expires: expiresAtSeconds,
			httpOnly: false,
			secure: false,
			sameSite: "Lax",
		})),
		origins: [],
	};
}

async function main() {
	console.log("=== save-e2e-storage-state ===");
	const ref = projectRef(SUPABASE_URL!);
	const cookieName = `sb-${ref}-auth-token`;
	console.log(`Cookie key: ${cookieName}`);

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
	const hostname = new URL(appUrl).hostname; // localhost in dev

	const outDir = resolve(__dirname, "../tests/.auth");
	await mkdir(outDir, { recursive: true });

	for (const t of TARGETS) {
		console.log(`\n--- ${t.role} (${t.email}) ---`);
		const session = await signInWithPassword(t.email);
		const value = buildCookieValue(session);
		console.log(
			`  ✓ session minted (access_token ${session.access_token.length} chars, expires in ${session.expires_in}s)`,
		);
		const state = buildStorageState(
			cookieName,
			value,
			session.expires_at ??
				Math.floor(Date.now() / 1000) + session.expires_in,
			hostname,
		);
		const outPath = resolve(outDir, `${t.role}.json`);
		await writeFile(outPath, JSON.stringify(state, null, 2));
		console.log(`  ✓ wrote ${outPath} (${state.cookies.length} cookie chunk(s))`);
	}

	console.log("\n✓ Fixtures ready. Run E2E:");
	console.log("    E2E_AUTH_READY=1 bun run test:e2e");
	console.log(
		"\nFixtures expire ~1h after this run. Re-run e2e:auth-setup before each session.",
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
