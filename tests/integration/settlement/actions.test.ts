import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
	},
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("settlement actions (DB)", () => {
	let seed: typeof import("../_seed");
	let mod: typeof import("@/lib/settlement/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		mod = await import("@/lib/settlement/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("accrueEarning → pending 6000, 재호출 멱등(중복 행 없음)", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
		});

		await mod.accrueEarning({ submissionId, evaluatorUserId: evaluator.id });
		await mod.accrueEarning({ submissionId, evaluatorUserId: evaluator.id });

		const rows = await seed.pg`
			SELECT amount, status FROM evaluator_earnings
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${evaluator.id}`;
		expect(rows.length).toBe(1);
		expect(rows[0].amount).toBe(6000);
		expect(rows[0].status).toBe("pending");
	});

	it("voidEarningsForSubmission → pending→void(voided_at), 재호출 no-op", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
		});
		await mod.accrueEarning({ submissionId, evaluatorUserId: evaluator.id });

		await mod.voidEarningsForSubmission(submissionId);
		const v = await seed.pg`
			SELECT status, voided_at FROM evaluator_earnings WHERE submission_id = ${submissionId}`;
		expect(v[0].status).toBe("void");
		expect(v[0].voided_at).not.toBeNull();

		await mod.voidEarningsForSubmission(submissionId);
		const v2 = await seed.pg`
			SELECT status FROM evaluator_earnings WHERE submission_id = ${submissionId}`;
		expect(v2[0].status).toBe("void");
	});

	it("listEarnings → 본인 적립 반환", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
		});
		await mod.accrueEarning({ submissionId, evaluatorUserId: evaluator.id });

		const list = await mod.listEarnings(evaluator.id);
		expect(
			list.some((e) => e.submissionId === submissionId && e.amount === 6000),
		).toBe(true);
	});
});
