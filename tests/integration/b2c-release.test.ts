import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// WS6/WS7 — release gate + primary resolution + consumer visibility (DB-gated).
//
// releaseSubmission() gates on getCurrentUser() (Supabase session) but writes via
// the direct postgres `db` in one transaction. We mock getCurrentUser to return
// the seeded owner/consumer (the only piece needing an HTTP context) and call the
// REAL action so the release transaction (scored->released + is_primary on the
// primary label only) is verified against dev.
//
// The consumer-visibility assertion exercises RLS via asAuthenticated() (SET LOCAL
// ROLE authenticated + jwt claims).
//
// Required env to actually run: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL, RLS_TEST_DB=1.
const skip =
	!process.env.SUPABASE_SERVICE_ROLE_KEY ||
	!process.env.NEXT_PUBLIC_SUPABASE_URL ||
	!process.env.DATABASE_URL ||
	process.env.RLS_TEST_DB !== "1";

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

const currentUser = {
	value: null as null | { id: string; email: string; role: string },
};

vi.mock("@/lib/auth/current-user", () => ({
	getCurrentUser: async () => {
		if (!currentUser.value) return null;
		return {
			authUser: { id: currentUser.value.id, email: currentUser.value.email },
			appUser: {
				id: currentUser.value.id,
				email: currentUser.value.email,
				academyId: null,
				role: currentUser.value.role,
			},
			academyId: null,
			role: currentUser.value.role,
		};
	},
}));

describe.skipIf(skip)(
	"WS6/WS7 — release gate + primary resolution + consumer visibility",
	() => {
		let seed: typeof import("./_seed");
		let releaseSubmission: typeof import("@/lib/submissions/release-action").releaseSubmission;
		let scope: ReturnType<typeof import("./_seed").newScope>;

		beforeAll(async () => {
			seed = await import("./_seed");
			({ releaseSubmission } = await import(
				"@/lib/submissions/release-action"
			));
			scope = seed.newScope();
		});

		afterAll(async () => {
			await seed.cleanupScope(scope);
		});

		it("release requires scored + paid; not_paid / not_scored otherwise; flips to released when both", async () => {
			const consumer = await seed.seedUser(scope, "consumer");
			currentUser.value = { ...consumer };

			// scored, NOT paid → not_paid
			const sub1 = await seed.seedSubmission(scope, consumer.id, {
				status: "scored",
				paidAt: false,
			});
			const r1 = await releaseSubmission(sub1);
			expect(r1.ok).toBe(false);
			if (!r1.ok) expect(r1.error).toBe("not_paid");

			// assigned, paid → not_scored
			const sub2 = await seed.seedSubmission(scope, consumer.id, {
				status: "assigned",
				paidAt: true,
			});
			const r2 = await releaseSubmission(sub2);
			expect(r2.ok).toBe(false);
			if (!r2.ok) expect(r2.error).toBe("not_scored");

			// scored + paid → released
			const sub3 = await seed.seedSubmission(scope, consumer.id, {
				status: "scored",
				paidAt: true,
			});
			const r3 = await releaseSubmission(sub3);
			expect(r3.ok).toBe(true);
			const st =
				await seed.pg`SELECT status FROM submissions WHERE id = ${sub3}`;
			expect(st[0].status).toBe("released");

			// idempotent: releasing again is a no-op success
			const r3again = await releaseSubmission(sub3);
			expect(r3again.ok).toBe(true);
			if (r3again.ok) expect(r3again.alreadyReleased).toBe(true);
		});

		it("release sets is_primary=true on the PRIMARY label only (redundant untouched)", async () => {
			const consumer = await seed.seedUser(scope, "consumer");
			const e1 = await seed.seedUser(scope, "evaluator", {
				evaluatorActive: true,
			});
			const e2 = await seed.seedUser(scope, "evaluator", {
				evaluatorActive: true,
			});
			currentUser.value = { ...consumer };

			const submissionId = await seed.seedSubmission(scope, consumer.id, {
				status: "scored",
				paidAt: true,
			});
			// primary assignment (e1) + redundant assignment (e2), each with a label
			await seed.seedAssignment(submissionId, e1.id, false, "submitted");
			await seed.seedAssignment(submissionId, e2.id, true, "submitted");
			await seed.seedLabel(submissionId, e1.id, { isPrimary: false });
			await seed.seedLabel(submissionId, e2.id, { isPrimary: false });

			const res = await releaseSubmission(submissionId);
			expect(res.ok).toBe(true);

			const primary = await seed.pg`
			SELECT is_primary FROM labeled_results
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
			const redundant = await seed.pg`
			SELECT is_primary FROM labeled_results
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e2.id}`;
			expect(primary[0].is_primary).toBe(true);
			expect(redundant[0].is_primary).toBe(false);

			// exactly one is_primary=true label on the submission
			const cnt = await seed.pg`
			SELECT count(*)::int AS n FROM labeled_results
			WHERE submission_id = ${submissionId} AND is_primary = true`;
			expect(cnt[0].n).toBe(1);
		});

		it("RLS: consumer cannot read labeled_results until released + is_primary", async () => {
			const consumer = await seed.seedUser(scope, "consumer");
			const e1 = await seed.seedUser(scope, "evaluator", {
				evaluatorActive: true,
			});
			const submissionId = await seed.seedSubmission(scope, consumer.id, {
				status: "scored",
				paidAt: true,
			});
			await seed.seedAssignment(submissionId, e1.id, false, "submitted");
			await seed.seedLabel(submissionId, e1.id, { isPrimary: false });

			// BEFORE release: consumer sees no label rows
			const before = await seed.asAuthenticated(consumer.id, async (tx) => {
				return tx`SELECT id FROM labeled_results WHERE submission_id = ${submissionId}`;
			});
			expect(before.length).toBe(0);

			// release (flips status + is_primary)
			currentUser.value = { ...consumer };
			await releaseSubmission(submissionId);

			// AFTER release: consumer sees exactly the primary label
			const after = await seed.asAuthenticated(consumer.id, async (tx) => {
				return tx`SELECT id, is_primary FROM labeled_results WHERE submission_id = ${submissionId}`;
			});
			expect(after.length).toBe(1);
			expect(after[0].is_primary).toBe(true);
		});
	},
);
