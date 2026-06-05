import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
		FEATURE_PAYMENT_ENABLED: "false",
		KAKAO_PAY_SECRET_KEY: undefined,
		KAKAO_PAY_CID: undefined,
	},
}));
let currentUserId = "";
let currentRole = "consumer";
vi.mock("@/lib/auth/current-user", () => ({
	getCurrentUser: async () => ({
		appUser: { id: currentUserId, role: currentRole },
	}),
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("settlement hooks (release accrue / refund void)", () => {
	let seed: typeof import("../_seed");
	let release: typeof import("@/lib/submissions/release-action");
	let payments: typeof import("@/lib/payments/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		release = await import("@/lib/submissions/release-action");
		payments = await import("@/lib/payments/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("release → primary 평가자 earning pending 적립", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "scored",
			paidAt: true,
		});
		await seed.seedAssignment(submissionId, evaluator.id, false, "submitted");
		await seed.seedLabel(submissionId, evaluator.id, {});

		currentUserId = consumer.id;
		currentRole = "consumer";
		const r = await release.releaseSubmission(submissionId);
		expect(r.ok).toBe(true);

		const e = await seed.pg`
			SELECT amount, status FROM evaluator_earnings
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${evaluator.id}`;
		expect(e.length).toBe(1);
		expect(e[0].amount).toBe(6000);
		expect(e[0].status).toBe("pending");
	});

	it("refund → 해당 적립 void", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
			paidAt: true,
		});
		await seed.seedAssignment(submissionId, evaluator.id, false, "submitted");
		await seed.seedLabel(submissionId, evaluator.id, { isPrimary: true });
		await seed.pg`
			INSERT INTO evaluator_earnings (evaluator_user_id, submission_id, amount, status)
			VALUES (${evaluator.id}, ${submissionId}, 6000, 'pending')`;
		const ord = await seed.pg`
			INSERT INTO payment_orders (submission_id, user_id, amount, provider, provider_tid, status, approved_at)
			VALUES (${submissionId}, ${consumer.id}, 9900, 'stub', 'stub_x', 'approved', now())
			RETURNING id`;

		currentUserId = "admin-1";
		currentRole = "admin";
		const r = await payments.refundOrder(ord[0].id as string);
		expect(r.ok).toBe(true);

		const e = await seed.pg`
			SELECT status FROM evaluator_earnings WHERE submission_id = ${submissionId}`;
		expect(e[0].status).toBe("void");
	});
});
