import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
	createClient: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
	db: {
		query: { users: { findFirst: vi.fn() } },
	},
}));

import { GET } from "@/app/auth/callback/route";
import { db } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";

const makeReq = (url: string) =>
	new Request(url) as unknown as Parameters<typeof GET>[0];

describe("GET /auth/callback", () => {
	beforeEach(() => vi.clearAllMocks());

	it("redirects to /auth/not-invited when email not pre-seeded", async () => {
		vi.mocked(createClient).mockResolvedValue({
			auth: {
				exchangeCodeForSession: async () => ({ error: null }),
				getUser: async () => ({
					data: { user: { id: "auth-1", email: "stranger@x" } },
					error: null,
				}),
				signOut: async () => ({}),
			},
		} as unknown as Awaited<ReturnType<typeof createClient>>);
		vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

		const res = await GET(makeReq("http://localhost/auth/callback?code=x"));
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("/auth/not-invited");
	});

	it("redirects to next param when row.id matches auth.users.id", async () => {
		vi.mocked(createClient).mockResolvedValue({
			auth: {
				exchangeCodeForSession: async () => ({ error: null }),
				getUser: async () => ({
					data: { user: { id: "auth-1", email: "coach@x" } },
					error: null,
				}),
			},
		} as unknown as Awaited<ReturnType<typeof createClient>>);
		vi.mocked(db.query.users.findFirst).mockResolvedValue({
			id: "auth-1",
			email: "coach@x",
			academyId: "acad-1",
			role: "coach",
		} as unknown as ReturnType<typeof db.query.users.findFirst> extends Promise<
			infer T
		>
			? T
			: never);

		const res = await GET(
			makeReq("http://localhost/auth/callback?code=x&next=/students/abc"),
		);
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("/students/abc");
	});

	it("signs out + redirects when row.id mismatches auth.users.id", async () => {
		const signOut = vi.fn(async () => ({}));
		vi.mocked(createClient).mockResolvedValue({
			auth: {
				exchangeCodeForSession: async () => ({ error: null }),
				getUser: async () => ({
					data: { user: { id: "auth-NEW", email: "coach@x" } },
					error: null,
				}),
				signOut,
			},
		} as unknown as Awaited<ReturnType<typeof createClient>>);
		vi.mocked(db.query.users.findFirst).mockResolvedValue({
			id: "auth-OLD",
			email: "coach@x",
			academyId: "acad-1",
			role: "coach",
		} as unknown as ReturnType<typeof db.query.users.findFirst> extends Promise<
			infer T
		>
			? T
			: never);

		const res = await GET(makeReq("http://localhost/auth/callback?code=x"));
		expect(signOut).toHaveBeenCalled();
		expect(res.headers.get("location")).toContain("/auth/not-invited");
	});
});
