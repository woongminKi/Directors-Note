import { beforeEach, describe, expect, it, vi } from "vitest";

const insertReturning = vi.fn(async () => [{ id: "ev-NEW" }]);
const insertOnConflictDoNothing = vi.fn(() => ({ returning: insertReturning }));
const insertValues = vi.fn(() => ({
	onConflictDoNothing: insertOnConflictDoNothing,
	returning: insertReturning,
}));

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
	db: {
		query: {
			students: { findFirst: vi.fn() },
			evaluations: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({ values: insertValues })),
	},
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { startEvaluation } from "@/lib/evaluations/start-action";

const partial = <T>(v: unknown): T => v as T;

describe("startEvaluation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		insertReturning.mockResolvedValue([{ id: "ev-NEW" }]);
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
			expect(res.resumed).toBeUndefined();
		}
	});

	it("resumes existing same-day evaluation regardless of draft status", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			partial({ id: "stu-1", parentConsentOnFileAt: new Date() }),
		);
		vi.mocked(db.query.evaluations.findFirst).mockResolvedValue(
			partial({ id: "ev-OLD" }),
		);
		const res = await startEvaluation("stu-1");
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.evaluationId).toBe("ev-OLD");
			expect(res.resumed).toBe(true);
		}
	});

	it("returns existing row when onConflictDoNothing returns empty (race lost)", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			partial({ id: "stu-1", parentConsentOnFileAt: new Date() }),
		);
		// First findFirst (pre-insert): nothing.
		// Second findFirst (post-conflict): the winning row.
		vi.mocked(db.query.evaluations.findFirst)
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(partial({ id: "ev-WINNER" }));
		insertReturning.mockResolvedValueOnce([]); // conflict → empty
		const res = await startEvaluation("stu-1");
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.evaluationId).toBe("ev-WINNER");
			expect(res.resumed).toBe(true);
		}
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
