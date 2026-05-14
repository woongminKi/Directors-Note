import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
	db: {
		query: { users: { findFirst: vi.fn() } },
		insert: vi.fn(() => ({ values: vi.fn(async () => ({})) })),
	},
}));
vi.mock("@/lib/supabase/service-role", () => ({
	createServiceRoleClient: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { inviteUser } from "@/app/(admin)/users/new/actions";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

describe("inviteUser", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireRole).mockResolvedValue({
			academyId: "acad-1",
			appUser: {
				id: "u-owner",
				academyId: "acad-1",
				role: "owner",
				email: "owner@x",
			},
			authUser: { id: "u-owner", email: "owner@x" },
			role: "owner",
		});
	});

	it("rejects non-email input", async () => {
		const r = await inviteUser({ email: "not-an-email", role: "coach" });
		expect(r.ok).toBe(false);
	});

	it("rejects existing email", async () => {
		vi.mocked(db.query.users.findFirst).mockResolvedValue({
			id: "u-existing",
			email: "taken@example.com",
			academyId: "acad-1",
			role: "coach",
			displayName: null,
			kakaoId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const r = await inviteUser({ email: "taken@example.com", role: "coach" });
		expect(r).toEqual({ ok: false, error: "이미 등록된 이메일입니다" });
	});

	it("inserts row when valid + new", async () => {
		vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
		vi.mocked(createServiceRoleClient).mockReturnValue({
			auth: {
				admin: {
					inviteUserByEmail: vi.fn(async () => ({
						data: { user: { id: "u-NEW" } },
						error: null,
					})),
					deleteUser: vi.fn(async () => ({ error: null })),
				},
			},
		} as never);

		const r = await inviteUser({ email: "new@example.com", role: "coach" });
		expect(r.ok).toBe(true);
		expect(db.insert).toHaveBeenCalled();
	});

	it("rolls back auth.users when DB insert fails", async () => {
		vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
		const deleteUser = vi.fn(async () => ({ error: null }));
		vi.mocked(createServiceRoleClient).mockReturnValue({
			auth: {
				admin: {
					inviteUserByEmail: vi.fn(async () => ({
						data: { user: { id: "u-NEW" } },
						error: null,
					})),
					deleteUser,
				},
			},
		} as never);
		// Force the DB insert to throw
		vi.mocked(db.insert).mockImplementation(
			() =>
				({
					values: vi.fn(async () => {
						throw new Error("DB connection lost");
					}),
				}) as never,
		);

		const r = await inviteUser({ email: "new@example.com", role: "coach" });
		expect(r.ok).toBe(false);
		expect(deleteUser).toHaveBeenCalledWith("u-NEW");
	});
});
