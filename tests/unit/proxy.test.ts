import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Mock Supabase so getUser() returns no session (the cron-call scenario:
// Vercel cron has no auth cookie).
vi.mock("@supabase/ssr", () => ({
	createServerClient: () => ({
		auth: { getUser: async () => ({ data: { user: null } }) },
	}),
}));

import { proxy } from "@/proxy";

const run = (path: string) =>
	proxy(new NextRequest(new URL(`http://localhost${path}`)));

describe("proxy (auth middleware) — public path allowlist", () => {
	it("lets /api/cron/* through WITHOUT a session (route self-authenticates via CRON_SECRET)", async () => {
		const res = await run("/api/cron/sweep-assignments");
		// NextResponse.next() — not a redirect.
		expect(res.status).not.toBe(307);
		expect(res.headers.get("location")).toBeNull();
	});

	it("still redirects a protected page to /login when unauthenticated", async () => {
		const res = await run("/dashboard");
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("/login");
	});

	it("still protects other /api routes (allowlist is /api/cron-specific, not blanket /api)", async () => {
		const res = await run("/api/evaluations/abc/stream");
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("/login");
	});
});
