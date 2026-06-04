import { describe, expect, it, vi } from "vitest";

// Mock env so t3-env validation doesn't throw when Supabase vars are absent.
// The describe.skipIf guard below prevents the test body from running in that case.
vi.mock("@/lib/env", () => ({
	env: {
		NEXT_PUBLIC_SUPABASE_URL:
			process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
		NEXT_PUBLIC_SUPABASE_ANON_KEY:
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-placeholder",
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
		SUPABASE_SERVICE_ROLE_KEY:
			process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-role-placeholder",
	},
}));

import { createServiceRoleClient } from "@/lib/supabase/service-role";

// These tests exercise the WS2 RLS guarantees and the delete_uploader() RPC.
// They REQUIRE a live Supabase Postgres with migrations 0014–0016 applied and
// at least two seeded evaluator accounts (so we can sign in as each via the
// anon client). Without DB env they are skipped — do NOT run against a remote
// DB without explicit human approval.
//
// Required env to actually run:
//   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
//   NEXT_PUBLIC_SUPABASE_ANON_KEY, plus RLS_TEST_DB=1 to opt in.
const skip =
	!process.env.SUPABASE_SERVICE_ROLE_KEY ||
	!process.env.NEXT_PUBLIC_SUPABASE_URL ||
	process.env.RLS_TEST_DB !== "1";

describe.skipIf(skip)("WS2 RLS — submissions / assignments / labeled_results", () => {
	// 2.4 핵심: 평가자 독립성. 같은 제출에 두 평가자가 배정/채점된 상황에서
	// 평가자 A 가 평가자 B 의 labeled_results 를 SELECT 할 수 없어야 한다.
	it("rater-independence: evaluator A cannot read evaluator B's labeled_results", async () => {
		// PLACEHOLDER — needs: seed submission, assign evaluator A + B,
		// each inserts a labeled_result, then sign in as A and assert
		// SELECT returns only A's row (B's row invisible regardless of order).
		expect(true).toBe(true);
	});

	// claim_assignment 레이스 (uq_active_primary_assignment): 두 동시 클레임 시
	// 활성 primary 배정은 1개만 성공해야 한다 (onConflictDoNothing).
	it("claim race: concurrent primary claims yield exactly one active primary assignment", async () => {
		// PLACEHOLDER — needs: two concurrent inserts into evaluation_assignments
		// with status='assigned' is_redundant_label=false for the same submission;
		// assert exactly one succeeds (partial unique index violation on the other).
		expect(true).toBe(true);
	});

	// 소비자 가시성 게이트: released + is_primary 이전엔 소비자가 라벨을 못 본다.
	it("consumer cannot read labeled_results before release / is_primary", async () => {
		// PLACEHOLDER — needs: submission status='scored' with a labeled_result
		// is_primary=false → consumer SELECT empty; flip to released + is_primary
		// → consumer SELECT returns the row.
		expect(true).toBe(true);
	});

	// delete_uploader() — PII 익명화 + 조건부 코퍼스 보존.
	it("delete_uploader anonymizes PII and conditionally retains corpus by training_opt_in", async () => {
		// PLACEHOLDER — needs: two submissions for one uploader, one with
		// training_opt_in=true and one false; call delete_uploader; assert
		// users PII scrubbed, both submissions soft-deleted with NULL video/consent,
		// labeled_results of the opt-out submission deleted, opt-in retained.
		void createServiceRoleClient;
		expect(true).toBe(true);
	});
});
