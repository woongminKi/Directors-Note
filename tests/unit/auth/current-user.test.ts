import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
	createClient: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
	db: { query: { users: { findFirst: vi.fn() } } },
}));

import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";

describe("getCurrentUser", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns null when no Supabase session", async () => {
		vi.mocked(createClient).mockResolvedValue({
			auth: { getUser: async () => ({ data: { user: null }, error: null }) },
			// biome-ignore lint/suspicious/noExplicitAny: partial Supabase client mock
		} as any);
		expect(await getCurrentUser()).toBeNull();
	});

	it("returns null when session exists but no users row", async () => {
		vi.mocked(createClient).mockResolvedValue({
			auth: {
				getUser: async () => ({
					data: { user: { id: "auth-1", email: "x@y" } },
					error: null,
				}),
			},
			// biome-ignore lint/suspicious/noExplicitAny: partial Supabase client mock
		} as any);
		vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
		expect(await getCurrentUser()).toBeNull();
	});

	it("returns shape { authUser, appUser, academyId, role } when both rows exist", async () => {
		vi.mocked(createClient).mockResolvedValue({
			auth: {
				getUser: async () => ({
					data: { user: { id: "auth-1", email: "x@y" } },
					error: null,
				}),
			},
			// biome-ignore lint/suspicious/noExplicitAny: partial Supabase client mock
		} as any);
		vi.mocked(db.query.users.findFirst).mockResolvedValue({
			id: "auth-1",
			academyId: "acad-1",
			role: "coach",
			email: "x@y",
			// biome-ignore lint/suspicious/noExplicitAny: partial Drizzle row mock
		} as any);
		const result = await getCurrentUser();
		expect(result).toEqual({
			authUser: { id: "auth-1", email: "x@y" },
			appUser: {
				id: "auth-1",
				academyId: "acad-1",
				role: "coach",
				email: "x@y",
			},
			academyId: "acad-1",
			role: "coach",
		});
	});
});
