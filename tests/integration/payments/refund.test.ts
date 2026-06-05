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
let currentRole = "admin";
let currentUserId = "admin-1";
vi.mock("@/lib/auth/current-user", () => ({
	getCurrentUser: async () => ({
		appUser: { id: currentUserId, role: currentRole },
	}),
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("refundOrder (stub mode, DB)", () => {
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

	async function seedApprovedOrder() {
		const consumer = await seed.seedUser(scope, "consumer");
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
			paidAt: true,
		});
		const rows = await seed.pg`
			INSERT INTO payment_orders (submission_id, user_id, amount, provider, provider_tid, status, approved_at)
			VALUES (${submissionId}, ${consumer.id}, 9900, 'stub', ${"stub_x"}, 'approved', now())
			RETURNING id`;
		return { orderId: rows[0].id as string, submissionId };
	}

	it("admin approved 환불 → canceled + canceled_at + 재잠금(paid_at NULL, scored)", async () => {
		currentRole = "admin";
		const { orderId, submissionId } = await seedApprovedOrder();
		const r = await mod.refundOrder(orderId);
		expect(r).toEqual({ ok: true });

		const o = await seed.pg`
			SELECT status, canceled_at FROM payment_orders WHERE id = ${orderId}`;
		expect(o[0].status).toBe("canceled");
		expect(o[0].canceled_at).not.toBeNull();

		const s = await seed.pg`
			SELECT status, paid_at FROM submissions WHERE id = ${submissionId}`;
		expect(s[0].paid_at).toBeNull();
		expect(s[0].status).toBe("scored");
	});

	it("멱등 — 이미 canceled 면 ok", async () => {
		currentRole = "admin";
		const { orderId } = await seedApprovedOrder();
		await mod.refundOrder(orderId);
		const again = await mod.refundOrder(orderId);
		expect(again).toEqual({ ok: true });
	});

	it("비-admin → forbidden, 상태 불변", async () => {
		currentRole = "consumer";
		const { orderId } = await seedApprovedOrder();
		const r = await mod.refundOrder(orderId);
		expect(r).toEqual({ ok: false, error: "forbidden" });
		const o = await seed.pg`SELECT status FROM payment_orders WHERE id = ${orderId}`;
		expect(o[0].status).toBe("approved");
		currentRole = "admin";
	});

	it("approved 아님(ready) → not_refundable", async () => {
		currentRole = "admin";
		const consumer = await seed.seedUser(scope, "consumer");
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "scored",
		});
		const rows = await seed.pg`
			INSERT INTO payment_orders (submission_id, user_id, amount, provider, status)
			VALUES (${submissionId}, ${consumer.id}, 9900, 'stub', 'ready')
			RETURNING id`;
		const r = await mod.refundOrder(rows[0].id as string);
		expect(r).toEqual({ ok: false, error: "not_refundable" });
	});
});
