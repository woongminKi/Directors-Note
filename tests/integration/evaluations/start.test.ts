import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
	db: {
		query: {
			students: { findFirst: vi.fn() },
			evaluations: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(async () => [{ id: "ev-NEW" }]),
			})),
		})),
	},
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { startEvaluation } from "@/lib/evaluations/start-action";

const partial = <T>(v: unknown): T => v as T;

describe("startEvaluation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireAuth).mockResolvedValue({
			academyId: "acad-1",
			appUser: { id: "u-1", academyId: "acad-1", role: "coach", email: "x@y" },
			authUser: { id: "u-1", email: "x@y" },
			role: "coach",
		});
		process.env.FEATURE_AI_VIDEO_ANALYSIS = "false";
	});

	it("returns no_consent when student lacks consent", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			partial({ id: "stu-1", parentConsentOnFileAt: null }),
		);
		const res = await startEvaluation("stu-1");
		expect(res).toEqual({ ok: false, error: "no_consent" });
	});

	it("creates evaluation when consent ok and no in-flight", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			partial({ id: "stu-1", parentConsentOnFileAt: new Date() }),
		);
		vi.mocked(db.query.evaluations.findFirst).mockResolvedValue(undefined);
		const res = await startEvaluation("stu-1");
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.evaluationId).toBe("ev-NEW");
			expect(res.redirectTo).toContain("/coach-form");
		}
	});

	it("resumes existing in-flight evaluation (status != sent)", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			partial({ id: "stu-1", parentConsentOnFileAt: new Date() }),
		);
		vi.mocked(db.query.evaluations.findFirst).mockResolvedValue(
			partial({ id: "ev-OLD", feedbackDraft: { status: "draft" } }),
		);
		const res = await startEvaluation("stu-1");
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.evaluationId).toBe("ev-OLD");
			expect(res.resumed).toBe(true);
		}
	});

	it("creates new evaluation when previous is sent", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			partial({ id: "stu-1", parentConsentOnFileAt: new Date() }),
		);
		vi.mocked(db.query.evaluations.findFirst).mockResolvedValue(
			partial({ id: "ev-OLD", feedbackDraft: { status: "sent" } }),
		);
		const res = await startEvaluation("stu-1");
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.evaluationId).toBe("ev-NEW");
	});

	it("redirects to /evaluation/[id] (Approach-C) when feature flag ON", async () => {
		process.env.FEATURE_AI_VIDEO_ANALYSIS = "true";
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			partial({ id: "stu-1", parentConsentOnFileAt: new Date() }),
		);
		vi.mocked(db.query.evaluations.findFirst).mockResolvedValue(undefined);
		const res = await startEvaluation("stu-1");
		if (res.ok) expect(res.redirectTo).toBe("/evaluation/ev-NEW");
	});
});
