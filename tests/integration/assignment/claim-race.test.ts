import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// t3-env flags vitest (jsdom) as a client environment and throws on server var
// access. Mock it to surface the real process.env values for the direct db client.
vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
		FEATURE_PAYMENT_ENABLED: process.env.FEATURE_PAYMENT_ENABLED ?? "false",
	},
}));

// WS4 — atomic-claim race integration test (DB-gated).
//
// Exercises the SAME logic assignSubmission() relies on: the partial unique index
// `uq_active_primary_assignment` (status='assigned' AND is_redundant_label=false)
// paired with INSERT ... ON CONFLICT DO NOTHING. Two concurrent primary claims on
// one queued submission must yield exactly ONE active primary, and the submission
// must flip to 'assigned' once.
//
// Runs via the direct postgres `db` (postgres role) which BYPASSES RLS — matching
// actions.ts, which writes via the service-role-style direct connection. We import
// and call the real assignSubmission() so the production code path is verified.
//
// Required env to actually run: DATABASE_URL + ASSIGNMENT_TEST_DB=1.
const skip =
	!process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("WS4 claim race — uq_active_primary_assignment", () => {
	let seed: typeof import("../_seed");
	let assignSubmission: typeof import("@/lib/assignment/actions").assignSubmission;
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		({ assignSubmission } = await import("@/lib/assignment/actions"));
		scope = seed.newScope();
	});

	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("two concurrent assignSubmission on one queued submission → exactly one active primary", async () => {
		const s = scope;
		const consumer = await seed.seedUser(s, "consumer");
		await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		const submissionId = await seed.seedSubmission(s, consumer.id, {
			status: "queued",
		});

		// force rng high so no redundant double-label is created (isolates primary race)
		const noRedundant = () => 0.99;
		const [a, b] = await Promise.all([
			assignSubmission(submissionId, noRedundant),
			assignSubmission(submissionId, noRedundant),
		]);

		const primaries = await seed.pg`
			SELECT count(*)::int AS n FROM evaluation_assignments
			WHERE submission_id = ${submissionId}
			  AND status = 'assigned' AND is_redundant_label = false`;
		expect(primaries[0].n).toBe(1);

		const sub =
			await seed.pg`SELECT status FROM submissions WHERE id = ${submissionId}`;
		expect(sub[0].status).toBe("assigned");

		// At most one call reports a successful primary assignment.
		const assignedCount = [a, b].filter(
			(r) => r.ok && r.assigned === true,
		).length;
		expect(assignedCount).toBeGreaterThanOrEqual(1);
		expect(assignedCount).toBeLessThanOrEqual(2);
		// Both calls succeed (ok), neither errors.
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
	});

	it("redundant double-label creates a second (redundant) assignment, never a second active primary", async () => {
		const s = scope;
		const consumer = await seed.seedUser(s, "consumer");
		await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		const submissionId = await seed.seedSubmission(s, consumer.id, {
			status: "queued",
		});

		// rng below REDUNDANT_LABEL_RATE (0.15) → force a redundant double-label.
		const r = await assignSubmission(submissionId, () => 0.01);
		expect(r.ok).toBe(true);

		const primary = await seed.pg`
			SELECT count(*)::int AS n FROM evaluation_assignments
			WHERE submission_id = ${submissionId}
			  AND status = 'assigned' AND is_redundant_label = false`;
		const redundant = await seed.pg`
			SELECT evaluator_user_id FROM evaluation_assignments
			WHERE submission_id = ${submissionId} AND is_redundant_label = true`;
		const primaryRows = await seed.pg`
			SELECT evaluator_user_id FROM evaluation_assignments
			WHERE submission_id = ${submissionId} AND is_redundant_label = false`;

		expect(primary[0].n).toBe(1);
		expect(redundant.length).toBe(1);
		// primary and redundant must be different evaluators
		expect(redundant[0].evaluator_user_id).not.toBe(
			primaryRows[0].evaluator_user_id,
		);
	});
});
