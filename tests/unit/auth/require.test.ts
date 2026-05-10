import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({
	redirect: vi.fn((path) => {
		throw new Error(`REDIRECT:${path}`);
	}),
}));

import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAuth } from "@/lib/auth/require-auth";
import { requireRole } from "@/lib/auth/require-role";

describe("requireAuth", () => {
	beforeEach(() => vi.clearAllMocks());

	it("redirects to /login when no current user", async () => {
		vi.mocked(getCurrentUser).mockResolvedValue(null);
		await expect(requireAuth()).rejects.toThrow("REDIRECT:/login");
	});

	it("returns CurrentUser when authenticated", async () => {
		const user = {
			authUser: { id: "u1", email: "a@b" },
			appUser: {
				id: "u1",
				academyId: "ac1",
				role: "coach" as const,
				email: "a@b",
			},
			academyId: "ac1",
			role: "coach" as const,
		};
		vi.mocked(getCurrentUser).mockResolvedValue(user);
		expect(await requireAuth()).toEqual(user);
	});
});

describe("requireRole", () => {
	beforeEach(() => vi.clearAllMocks());

	it("redirects to /students when role is insufficient", async () => {
		const user = {
			authUser: { id: "u1", email: "a@b" },
			appUser: {
				id: "u1",
				academyId: "ac1",
				role: "coach" as const,
				email: "a@b",
			},
			academyId: "ac1",
			role: "coach" as const,
		};
		vi.mocked(getCurrentUser).mockResolvedValue(user);
		await expect(requireRole(["owner", "admin"])).rejects.toThrow(
			"REDIRECT:/students",
		);
	});

	it("returns user when role matches", async () => {
		const user = {
			authUser: { id: "u1", email: "a@b" },
			appUser: {
				id: "u1",
				academyId: "ac1",
				role: "owner" as const,
				email: "a@b",
			},
			academyId: "ac1",
			role: "owner" as const,
		};
		vi.mocked(getCurrentUser).mockResolvedValue(user);
		expect(await requireRole(["owner", "admin"])).toEqual(user);
	});
});
