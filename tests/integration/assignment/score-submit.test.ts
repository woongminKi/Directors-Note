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

// WS5 — submitEvaluatorScore integration test (DB-gated).
//
// submitEvaluatorScore() gates on requireEvaluator() (Supabase session) but does
// all writes via the direct postgres `db` in one transaction. We mock
// requireEvaluator to return the seeded evaluator (the only piece that needs an
// HTTP/cookie context), then call the REAL action so the actual transaction
// (labeled_results insert + assignment 'submitted' + submission 'scored' +
// labels_completed++) is exercised against dev.
//
// Required env to actually run: DATABASE_URL + ASSIGNMENT_TEST_DB=1.
const skip =
	!process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

// requireEvaluator is swapped per-test via this mutable holder.
const currentEvaluator = {
	value: null as null | { id: string; email: string },
};

vi.mock("@/lib/auth/require-evaluator", () => ({
	requireEvaluator: async () => {
		if (!currentEvaluator.value) throw new Error("no evaluator set in test");
		return {
			authUser: currentEvaluator.value,
			appUser: {
				...currentEvaluator.value,
				academyId: null,
				role: "evaluator",
			},
			academyId: null,
			role: "evaluator",
		};
	},
}));

const VALID_INPUT = {
	vocal: 8,
	expression: 7,
	movement: 6,
	examReadiness: 9,
	rationale: {
		vocal: "발성 좋음",
		expression: "표현 풍부",
		movement: "동선 안정",
		examReadiness: "입시 준비 우수",
	},
	holisticGrade: "A" as const,
};

describe.skipIf(skip)("WS5 submitEvaluatorScore", () => {
	let seed: typeof import("../_seed");
	let submitEvaluatorScore: typeof import("@/lib/assignment/score-action").submitEvaluatorScore;
	let deriveGradeFromScores: typeof import("@/lib/evaluation/grade-derivation").deriveGradeFromScores;
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		({ submitEvaluatorScore } = await import("@/lib/assignment/score-action"));
		({ deriveGradeFromScores } = await import(
			"@/lib/evaluation/grade-derivation"
		));
		scope = seed.newScope();
	});

	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("primary submit → labeled_results row + assignment 'submitted' + submission 'scored' + labels_completed++", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const e1 = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "assigned",
		});
		await seed.seedAssignment(submissionId, e1.id, false, "assigned");

		currentEvaluator.value = { id: e1.id, email: e1.email };
		const res = await submitEvaluatorScore(submissionId, VALID_INPUT);
		expect(res.ok).toBe(true);

		const expectedGrade = deriveGradeFromScores([8, 7, 6, 9]);
		const labels = await seed.pg`
			SELECT evaluator_user_id, source, rubric_version, derived_grade, is_primary
			FROM labeled_results WHERE submission_id = ${submissionId}`;
		expect(labels.length).toBe(1);
		expect(labels[0].evaluator_user_id).toBe(e1.id);
		expect(labels[0].source).toBe("human");
		expect(labels[0].rubric_version).toBe("judge-rubric-v1");
		expect(labels[0].derived_grade).toBe(expectedGrade);
		expect(labels[0].is_primary).toBe(false); // is_primary only set at release

		const asn = await seed.pg`
			SELECT status FROM evaluation_assignments
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
		expect(asn[0].status).toBe("submitted");

		const sub =
			await seed.pg`SELECT status FROM submissions WHERE id = ${submissionId}`;
		expect(sub[0].status).toBe("scored");

		const u =
			await seed.pg`SELECT labels_completed FROM users WHERE id = ${e1.id}`;
		expect(u[0].labels_completed).toBe(1);
	});

	it("redundant submit → submission status UNCHANGED (only primary flips it)", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const e1 = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const e2 = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "assigned",
		});
		await seed.seedAssignment(submissionId, e1.id, false, "assigned"); // primary
		await seed.seedAssignment(submissionId, e2.id, true, "assigned"); // redundant

		currentEvaluator.value = { id: e2.id, email: e2.email };
		const res = await submitEvaluatorScore(submissionId, VALID_INPUT);
		expect(res.ok).toBe(true);

		const asn = await seed.pg`
			SELECT status FROM evaluation_assignments
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e2.id}`;
		expect(asn[0].status).toBe("submitted");

		const sub =
			await seed.pg`SELECT status FROM submissions WHERE id = ${submissionId}`;
		expect(sub[0].status).toBe("assigned"); // redundant never scores
	});

	it("duplicate submit → onConflict no-op (still exactly one labeled_results row)", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const e1 = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "assigned",
		});
		await seed.seedAssignment(submissionId, e1.id, false, "assigned");

		currentEvaluator.value = { id: e1.id, email: e1.email };
		await submitEvaluatorScore(submissionId, VALID_INPUT);
		// re-open assignment to force a second submit attempt down the same path
		await seed.pg`UPDATE evaluation_assignments SET status='assigned'
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
		await submitEvaluatorScore(submissionId, VALID_INPUT);

		const labels = await seed.pg`
			SELECT count(*)::int AS n FROM labeled_results
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
		expect(labels[0].n).toBe(1);
	});

	it("no active assignment → error 'not_assigned', no writes", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const e3 = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "queued",
		});
		// no assignment for e3

		currentEvaluator.value = { id: e3.id, email: e3.email };
		const res = await submitEvaluatorScore(submissionId, VALID_INPUT);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toBe("not_assigned");

		const labels = await seed.pg`
			SELECT count(*)::int AS n FROM labeled_results
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e3.id}`;
		expect(labels[0].n).toBe(0);
	});
});
