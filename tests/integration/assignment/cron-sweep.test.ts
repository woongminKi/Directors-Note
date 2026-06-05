import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real sweeps + real DB; only env is mocked (t3-env client-env guard).
// CRON_SECRET added so the route's auth check passes.
vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
		FEATURE_PAYMENT_ENABLED: process.env.FEATURE_PAYMENT_ENABLED ?? "false",
		CRON_SECRET: "test-secret",
	},
}));

const skip =
	!process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

const authedReq = () =>
	new Request("http://localhost/api/cron/sweep-assignments", {
		headers: { authorization: "Bearer test-secret" },
	});

describe.skipIf(skip)("cron sweep route — expire + reassign + pickup", () => {
	let seed: typeof import("../_seed");
	let GET: typeof import("@/app/api/cron/sweep-assignments/route").GET;
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		({ GET } = await import("@/app/api/cron/sweep-assignments/route"));
		scope = seed.newScope();
	});

	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("overdue primary → expired; submission reverted and reassigned to a different evaluator", async () => {
		const s = scope;
		const consumer = await seed.seedUser(s, "consumer");
		const e1 = await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		const e2 = await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		const submissionId = await seed.seedSubmission(s, consumer.id, {
			status: "assigned",
		});
		// e1 holds an overdue primary assignment.
		await seed.seedAssignment(submissionId, e1.id, false, "assigned", true);

		const res = await GET(authedReq());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);

		// e1's assignment is now expired.
		const e1Rows = await seed.pg`
			SELECT status FROM evaluation_assignments
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
		expect(e1Rows[0].status).toBe("expired");

		// Exactly one active primary, now on e2 (e1 excluded on reassign).
		const active = await seed.pg`
			SELECT evaluator_user_id FROM evaluation_assignments
			WHERE submission_id = ${submissionId}
			  AND status = 'assigned' AND is_redundant_label = false`;
		expect(active.length).toBe(1);
		expect(active[0].evaluator_user_id).toBe(e2.id);

		// Submission flipped back to 'assigned' after reassignment.
		const sub = await seed.pg`
			SELECT status FROM submissions WHERE id = ${submissionId}`;
		expect(sub[0].status).toBe("assigned");
	});

	it("no overdue assignments → 200, nothing changes", async () => {
		const s = scope;
		const consumer = await seed.seedUser(s, "consumer");
		const e1 = await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		const submissionId = await seed.seedSubmission(s, consumer.id, {
			status: "assigned",
		});
		// future-due assignment (overdue defaults to false).
		await seed.seedAssignment(submissionId, e1.id, false, "assigned");

		const res = await GET(authedReq());
		expect(res.status).toBe(200);

		const rows = await seed.pg`
			SELECT status FROM evaluation_assignments
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
		expect(rows[0].status).toBe("assigned");
	});
});
