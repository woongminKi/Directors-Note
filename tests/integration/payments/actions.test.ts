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
// requireConsumer + getCurrentUser 를 시드한 소비자로 대체.
// (approveOrder → releaseSubmission 이 getCurrentUser 로 소유자 인가를 하므로 둘 다 필요.)
let currentConsumerId = "";
vi.mock("@/lib/auth/require-consumer", () => ({
	requireConsumer: async () => ({ appUser: { id: currentConsumerId } }),
}));
vi.mock("@/lib/auth/current-user", () => ({
	getCurrentUser: async () => ({
		appUser: { id: currentConsumerId, role: "consumer" },
	}),
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("payment actions (stub mode, DB)", () => {
	let seed: typeof import("../_seed");
	let mod: typeof import("@/lib/payments/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		mod = await import("@/lib/payments/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("stub payReady → 주문 approved + paid_at 스탬프 + scored→released", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		currentConsumerId = consumer.id;
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "scored",
		});
		await seed.seedAssignment(submissionId, evaluator.id, false, "submitted");
		await seed.seedLabel(submissionId, evaluator.id, {});

		const r = await mod.payReady(submissionId);
		expect(r.ok).toBe(true);

		const order = await seed.pg`
			SELECT status, amount FROM payment_orders WHERE submission_id = ${submissionId}`;
		expect(order[0].status).toBe("approved");
		expect(order[0].amount).toBe(9900);

		const sub = await seed.pg`
			SELECT status, paid_at FROM submissions WHERE id = ${submissionId}`;
		expect(sub[0].paid_at).not.toBeNull();
		expect(sub[0].status).toBe("released");
	});

	it("approveOrder 멱등 — 두 번째 호출은 no-op ok", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		currentConsumerId = consumer.id;
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "scored",
		});
		const r = await mod.payReady(submissionId);
		expect(r.ok).toBe(true);
		const order = await seed.pg`
			SELECT id FROM payment_orders WHERE submission_id = ${submissionId}`;
		const again = await mod.approveOrder(order[0].id, "stub");
		expect(again.ok).toBe(true);
	});

	it("미채점(queued) 제출 → not_payable, 주문 미생성", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		currentConsumerId = consumer.id;
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "queued",
		});
		const r = await mod.payReady(submissionId);
		expect(r).toEqual({ ok: false, error: "not_payable" });
		const orders = await seed.pg`
			SELECT 1 FROM payment_orders WHERE submission_id = ${submissionId}`;
		expect(orders.length).toBe(0);
	});

	it("이미 결제됨 → not_payable, 추가 주문 미생성", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		currentConsumerId = consumer.id;
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "scored",
			paidAt: true,
		});
		const r = await mod.payReady(submissionId);
		expect(r).toEqual({ ok: false, error: "not_payable" });
		const orders = await seed.pg`
			SELECT 1 FROM payment_orders WHERE submission_id = ${submissionId}`;
		expect(orders.length).toBe(0);
	});
});
