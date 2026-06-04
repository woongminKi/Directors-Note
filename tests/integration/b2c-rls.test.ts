import { afterAll, beforeAll, describe, expect, it } from "vitest";

// WS2 RLS guarantees + delete_uploader() RPC (DB-gated).
//
// Uses the standard Supabase RLS-test technique (SET LOCAL ROLE authenticated +
// request.jwt.claims) via asAuthenticated() in _seed.ts. Fixtures are seeded via
// the direct postgres role (RLS bypass) and via the service-role auth admin API
// (auth.users rows are mandatory — public.users.id FKs auth.users(id), 0001).
//
// Required env to actually run: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL, RLS_TEST_DB=1.
const skip =
	!process.env.SUPABASE_SERVICE_ROLE_KEY ||
	!process.env.NEXT_PUBLIC_SUPABASE_URL ||
	!process.env.DATABASE_URL ||
	process.env.RLS_TEST_DB !== "1";

describe.skipIf(skip)(
	"WS2 RLS — submissions / assignments / labeled_results",
	() => {
		let seed: typeof import("./_seed");
		let scope: ReturnType<typeof import("./_seed").newScope>;

		beforeAll(async () => {
			seed = await import("./_seed");
			scope = seed.newScope();
		});

		afterAll(async () => {
			await seed.cleanupScope(scope);
		});

		it("auth.uid() resolves to the simulated sub inside asAuthenticated()", async () => {
			const u = await seed.seedUser(scope, "consumer");
			const got = await seed.asAuthenticated(u.id, async (tx) => {
				const r = await tx`SELECT auth.uid() AS uid`;
				return r[0].uid as string;
			});
			expect(got).toBe(u.id);
		});

		it("rater-independence: evaluator A cannot read evaluator B's labeled_results", async () => {
			const consumer = await seed.seedUser(scope, "consumer");
			const eA = await seed.seedUser(scope, "evaluator", {
				evaluatorActive: true,
			});
			const eB = await seed.seedUser(scope, "evaluator", {
				evaluatorActive: true,
			});
			const submissionId = await seed.seedSubmission(scope, consumer.id, {
				status: "assigned",
			});
			await seed.seedAssignment(submissionId, eA.id, false, "assigned");
			await seed.seedAssignment(submissionId, eB.id, true, "assigned");
			await seed.seedLabel(submissionId, eA.id);
			await seed.seedLabel(submissionId, eB.id);

			// Evaluator A SELECTs labeled_results on this submission: sees ONLY own row.
			const aRows = await seed.asAuthenticated(eA.id, async (tx) => {
				return tx`SELECT evaluator_user_id FROM labeled_results WHERE submission_id = ${submissionId}`;
			});
			expect(aRows.length).toBe(1);
			expect(aRows[0].evaluator_user_id).toBe(eA.id);
			// B's row must be invisible regardless of order.
			expect(aRows.some((r) => r.evaluator_user_id === eB.id)).toBe(false);
		});

		it("consumer gating: consumer sees own submission; sees label only when released + is_primary", async () => {
			const consumer = await seed.seedUser(scope, "consumer");
			const other = await seed.seedUser(scope, "consumer");
			const e1 = await seed.seedUser(scope, "evaluator", {
				evaluatorActive: true,
			});
			const submissionId = await seed.seedSubmission(scope, consumer.id, {
				status: "scored",
			});
			await seed.seedAssignment(submissionId, e1.id, false, "submitted");
			await seed.seedLabel(submissionId, e1.id, { isPrimary: false });

			// consumer sees own submission.
			// KNOWN DEFECT (FINDING #1): any authenticated SELECT on `submissions`
			// raises "stack depth limit exceeded" because the OR'd policies
			// submissions_evaluator_select / submissions_consumer_insert call my_role(),
			// and my_role()/my_academy_id() are NOT SECURITY DEFINER — their internal
			// `SELECT ... FROM users` re-triggers users_select RLS -> infinite recursion.
			// This assertion encodes the INTENDED behavior; it fails until the helpers
			// are made SECURITY DEFINER (or users_select is restructured).
			let ownSub: { length: number };
			try {
				ownSub = await seed.asAuthenticated(consumer.id, async (tx) => {
					return tx`SELECT id FROM submissions WHERE id = ${submissionId}`;
				});
			} catch (e) {
				throw new Error(
					`FINDING: authenticated SELECT on submissions recursed (my_role/my_academy_id not SECURITY DEFINER): ${e instanceof Error ? e.message : String(e)}`,
				);
			}
			expect(ownSub.length).toBe(1);

			// a different consumer cannot see it
			const foreignSub = await seed.asAuthenticated(other.id, async (tx) => {
				return tx`SELECT id FROM submissions WHERE id = ${submissionId}`;
			});
			expect(foreignSub.length).toBe(0);

			// label not visible: not released + is_primary=false (labeled_results read
			// is NOT affected by the recursion — its policies use only auth.uid()).
			const noLabel = await seed.asAuthenticated(consumer.id, async (tx) => {
				return tx`SELECT id FROM labeled_results WHERE submission_id = ${submissionId}`;
			});
			expect(noLabel.length).toBe(0);

			// flip to released + is_primary (service-role/direct write) → now visible
			await seed.pg`UPDATE submissions SET status='released' WHERE id = ${submissionId}`;
			await seed.pg`UPDATE labeled_results SET is_primary=true
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
			const seen = await seed.asAuthenticated(consumer.id, async (tx) => {
				return tx`SELECT id, is_primary FROM labeled_results WHERE submission_id = ${submissionId}`;
			});
			expect(seen.length).toBe(1);
			expect(seen[0].is_primary).toBe(true);
		});

		it("delete_uploader anonymizes PII and conditionally retains corpus by training_opt_in", async () => {
			const uploader = await seed.seedUser(scope, "consumer");
			const e1 = await seed.seedUser(scope, "evaluator", {
				evaluatorActive: true,
			});
			// opt-OUT submission (labels should be deleted)
			const subOut = await seed.seedSubmission(scope, uploader.id, {
				status: "scored",
				trainingOptIn: false,
			});
			// opt-IN submission (labels should be retained, anonymized)
			const subIn = await seed.seedSubmission(scope, uploader.id, {
				status: "scored",
				trainingOptIn: true,
			});
			await seed.seedAssignment(subOut, e1.id, false, "submitted");
			await seed.seedAssignment(subIn, e1.id, false, "submitted");
			await seed.seedLabel(subOut, e1.id);
			await seed.seedLabel(subIn, e1.id);

			// call delete_uploader as the uploader (own record), COMMITTED so effects
			// persist. The function guards on auth.uid()=p_uploader_id OR service_role,
			// so it must run inside an authenticated context.
			await seed.asAuthenticatedCommitted(uploader.id, async (tx) => {
				await tx`SELECT delete_uploader(${uploader.id}::uuid)`;
				return null;
			});

			const u =
				await seed.pg`SELECT email, kakao_id, display_name FROM users WHERE id = ${uploader.id}`;
			expect((u[0].email as string).startsWith("UPLOADER_DELETED_")).toBe(true);
			expect(u[0].kakao_id).toBeNull();

			const subs = await seed.pg`
			SELECT id, soft_deleted_at, video_storage_url, consent_artifact_url
			FROM submissions WHERE uploader_user_id = ${uploader.id}`;
			for (const s of subs) {
				expect(s.soft_deleted_at).not.toBeNull();
				expect(s.video_storage_url).toBeNull();
				expect(s.consent_artifact_url).toBeNull();
			}

			const outLabels =
				await seed.pg`SELECT count(*)::int AS n FROM labeled_results WHERE submission_id = ${subOut}`;
			const inLabels =
				await seed.pg`SELECT count(*)::int AS n FROM labeled_results WHERE submission_id = ${subIn}`;
			expect(outLabels[0].n).toBe(0); // opt-out labels deleted
			expect(inLabels[0].n).toBe(1); // opt-in labels retained
		});
	},
);
