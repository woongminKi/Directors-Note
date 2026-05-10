import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
	db: {
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn(async () => ({})) })),
		})),
	},
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { finalizeAndSend } from "@/lib/evaluations/finalize-action";

describe("finalizeAndSend", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireAuth).mockResolvedValue({
			academyId: "acad-1",
			appUser: { id: "u-1", academyId: "acad-1", role: "coach", email: "x@y" },
			authUser: { id: "u-1", email: "x@y" },
			role: "coach",
		});
		process.env.SHARE_LINK_PEPPER = "x".repeat(48);
		process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
	});

	it("returns must_start_greeting when text doesn't start with 안녕하세요", async () => {
		const r = await finalizeAndSend({
			draftId: "d-1",
			editedText: "반갑습니다",
		});
		expect(r).toEqual({ ok: false, error: "must_start_greeting" });
	});

	it("returns shareUrl on valid text", async () => {
		const text = "안녕하세요 학생 부모님. 좋습니다. 김코치 드림.";
		const r = await finalizeAndSend({ draftId: "d-1", editedText: text });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.shareUrl).toMatch(
				/^https:\/\/example\.test\/feedback\/[A-Za-z0-9_-]+$/,
			);
			expect(r.expiresAt).toBeInstanceOf(Date);
		}
	});
});
