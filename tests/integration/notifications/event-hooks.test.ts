import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
		FEATURE_WEB_PUSH: "true",
		FEATURE_PAYMENT_ENABLED: "false",
		VAPID_SUBJECT: "mailto:test@example.com",
		VAPID_PUBLIC_KEY: "BPUB",
		VAPID_PRIVATE_KEY: "PRIV",
	},
}));
vi.mock("web-push", () => ({
	default: { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue({}) },
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("event hooks → notifications enqueue", () => {
	let seed: typeof import("../_seed");
	let assign: typeof import("@/lib/assignment/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		assign = await import("@/lib/assignment/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("assignSubmission(primary) → evaluator 에게 evaluator_assigned 행 1개", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const e1 = await seed.seedUser(scope, "evaluator", { evaluatorActive: true });
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "queued",
		});
		// rng 높게 → redundant 없음(primary 격리).
		await assign.assignSubmission(submissionId, () => 0.99);

		const rows = await seed.pg`
			SELECT type FROM notifications
			WHERE user_id = ${e1.id} AND type = 'evaluator_assigned'`;
		expect(rows.length).toBe(1);
	});
});
