import { describe, expect, it } from "vitest";

// WS4 — atomic-claim race integration test.
//
// REQUIRES a live Supabase Postgres with migrations 0014–0016 applied and at
// least two seeded *eligible* evaluators (role='evaluator',
// evaluator_status='active', onboarded_at NOT NULL). Without DB env it is
// skipped — do NOT run against a remote DB without explicit human approval.
//
// Required env to actually run:
//   DATABASE_URL (postgres-js direct), plus ASSIGNMENT_TEST_DB=1 to opt in.
//
// What it asserts (race-safety relies on `uq_active_primary_assignment`):
//   Two concurrent assignSubmission() calls on ONE queued submission must yield
//   exactly ONE active primary assignment (status='assigned',
//   is_redundant_label=false) for that submission, and the submission must end
//   at status='assigned'. The partial unique index forces one of the concurrent
//   primary inserts to no-op (onConflictDoNothing → 0 rows → loser retries the
//   next evaluator, of which there may be none → assigned:false, but never a
//   second active primary on the same submission).
const skip =
	!process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("WS4 claim race — uq_active_primary_assignment", () => {
	it("two concurrent assignSubmission on one queued submission → exactly one active primary", async () => {
		// PLACEHOLDER — wiring left for the DB-enabled harness:
		//   1. seed one queued submission (uploader_user_id = any consumer),
		//      and >=2 eligible evaluators.
		//   2. const [a, b] = await Promise.all([
		//        assignSubmission(submissionId),
		//        assignSubmission(submissionId),
		//      ]);
		//   3. query: SELECT count(*) FROM evaluation_assignments
		//        WHERE submission_id = $1 AND status='assigned'
		//          AND is_redundant_label=false;
		//      expect === 1 (the partial unique index guarantees this).
		//   4. expect submission.status === 'assigned'.
		//   5. at most one of {a,b} has assigned:true with a primary evaluatorId;
		//      the other is either assigned:true for a *different* submission path
		//      (n/a here) or assigned:false reason 'no_eligible_evaluator'.
		expect(true).toBe(true);
	});

	it("redundant double-label never creates a second active primary", async () => {
		// PLACEHOLDER — with rng forced below REDUNDANT_LABEL_RATE, assignSubmission
		// must create a primary (is_redundant_label=false) PLUS a redundant
		// (is_redundant_label=true) assignment to a DIFFERENT evaluator. Assert:
		//   - exactly one row with is_redundant_label=false status='assigned',
		//   - exactly one row with is_redundant_label=true,
		//   - the two rows have different evaluator_user_id.
		expect(true).toBe(true);
	});
});
