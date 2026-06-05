// Shared seed/cleanup helpers for the DB-gated B2C integration tests (WS2/WS4/WS6).
//
// The dev DB is the production-pilot Supabase project, so hygiene is paramount:
//  - every fixture user is created in BOTH auth.users (admin API — required by the
//    public.users.id -> auth.users(id) FK from 0001) AND public.users.
//  - every row is tagged with an `rlstest+<uuid>@example.test` email so cleanup is
//    precise, and tracked in a SeedScope so afterAll() can tear everything down.
//
// Two clients:
//  - `db` : postgres-js direct (DATABASE_URL). Connects as the `postgres` role,
//    which BYPASSES RLS — used for seeding and for service-role-style writes.
//  - `admin` : supabase-js service-role client, only for auth.users create/delete.
//
// RLS simulation (asAuthenticated) follows the standard Supabase technique:
//   SET LOCAL ROLE authenticated; set_config('request.jwt.claims', {...sub,role}, true)
// inside a transaction so auth.uid() resolves to the simulated user and policies apply.

import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
	throw new Error(
		"_seed.ts requires DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (load .env.local via bun).",
	);
}

// max:5 so the claim-race test can run two concurrent connections.
export const pg = postgres(DATABASE_URL, { prepare: false, max: 5 });
export const db = drizzle(pg, { schema });
export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

export const TEST_EMAIL_PREFIX = "rlstest+";

export type SeededUser = { id: string; email: string; role: string };

export type SeedScope = {
	userIds: string[];
	submissionIds: string[];
};

export function newScope(): SeedScope {
	return { userIds: [], submissionIds: [] };
}

function tagEmail(): string {
	return `${TEST_EMAIL_PREFIX}${crypto.randomUUID().slice(0, 12)}@example.test`;
}

/**
 * Create a fixture user in auth.users (admin API) + public.users (direct db).
 * The auth.users row is mandatory because public.users.id FKs auth.users(id).
 */
export async function seedUser(
	scope: SeedScope,
	role: "consumer" | "evaluator" | "admin" | "owner" | "coach",
	opts: { evaluatorActive?: boolean } = {},
): Promise<SeededUser> {
	const email = tagEmail();
	const { data, error } = await admin.auth.admin.createUser({
		email,
		email_confirm: true,
	});
	if (error || !data.user) {
		throw new Error(`seedUser auth.admin.createUser failed: ${error?.message}`);
	}
	const id = data.user.id;
	scope.userIds.push(id);

	await pg`INSERT INTO users ${pg({ id, role, email })}`;
	if (role === "evaluator" && opts.evaluatorActive) {
		// timestamp set via SQL now() in a tagged template (not the pg({}) helper,
		// which does not serialize Date/fragment values for column maps).
		await pg`UPDATE users SET evaluator_status = 'active', onboarded_at = now() WHERE id = ${id}`;
	}
	return { id, email, role };
}

export type SeedSubmissionOpts = {
	status?: "queued" | "assigned" | "scored" | "released";
	paidAt?: boolean;
	isMinor?: boolean;
	ageBand?: "under14" | "14_18" | "adult";
	trainingOptIn?: boolean;
};

export async function seedSubmission(
	scope: SeedScope,
	uploaderId: string,
	opts: SeedSubmissionOpts = {},
): Promise<string> {
	const status = opts.status ?? "queued";
	const rows = await pg`
		INSERT INTO submissions
			(uploader_user_id, scene_type, video_storage_url, video_lifecycle_expires_at,
			 consent_artifact_url, is_minor, age_band, training_opt_in, status, paid_at)
		VALUES
			(${uploaderId}, 'monologue', 'gs://test/video.mp4', now() + interval '30 days',
			 'gs://test/consent.pdf', ${opts.isMinor ?? false}, ${opts.ageBand ?? "adult"},
			 ${opts.trainingOptIn ?? false}, ${status},
			 ${opts.paidAt ? pg`now()` : null})
		RETURNING id`;
	const id = rows[0].id as string;
	scope.submissionIds.push(id);
	return id;
}

/** Insert an assignment directly (service-role-style write; bypasses RLS).
 *  overdue=true → due_at 을 과거로(now() - 1h) 세팅해 만료 sweep 대상으로 만든다. */
export async function seedAssignment(
	submissionId: string,
	evaluatorId: string,
	isRedundant: boolean,
	status: "assigned" | "submitted" | "expired" | "reassigned" = "assigned",
	overdue = false,
): Promise<string> {
	const rows = await pg`
		INSERT INTO evaluation_assignments
			(submission_id, evaluator_user_id, due_at, status, is_redundant_label)
		VALUES (${submissionId}, ${evaluatorId},
			${overdue ? pg`now() - interval '1 hour'` : pg`now() + interval '48 hours'`},
			${status}, ${isRedundant})
		RETURNING id`;
	return rows[0].id as string;
}

/** Insert a labeled_result directly (bypasses RLS). */
export async function seedLabel(
	submissionId: string,
	evaluatorId: string,
	opts: { isPrimary?: boolean; grade?: "A" | "B" | "C" | "D" } = {},
): Promise<string> {
	const g = opts.grade ?? "B";
	const rows = await pg`
		INSERT INTO labeled_results
			(submission_id, evaluator_user_id, vocal_score, expression_score, movement_score,
			 exam_readiness_score, holistic_grade, derived_grade, rationale, rubric_version,
			 source, is_primary)
		VALUES (${submissionId}, ${evaluatorId}, 7.0, 7.0, 7.0, 7.0, ${g}, ${g},
			${JSON.stringify({ vocal: "근거", expression: "근거", movement: "근거", examReadiness: "근거" })}::jsonb,
			'judge-rubric-v1', 'human', ${opts.isPrimary ?? false})
		RETURNING id`;
	return rows[0].id as string;
}

/**
 * Run `fn` inside a transaction simulating an authenticated user `userId`.
 * Rolls back at the end (read-only assertions) unless commit:true.
 * Standard Supabase RLS-test technique: SET LOCAL ROLE authenticated + jwt claims.
 */
export async function asAuthenticated<T>(
	userId: string,
	fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
	let captured: T;
	try {
		await pg.begin(async (tx) => {
			await tx`SET LOCAL ROLE authenticated`;
			await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
			captured = await fn(tx);
			// roll back so RLS-read fixtures never persist
			throw new RollbackSignal();
		});
	} catch (e) {
		if (!(e instanceof RollbackSignal)) throw e;
	}
	// biome-ignore lint/style/noNonNullAssertion: assigned before rollback throw
	return captured!;
}

class RollbackSignal extends Error {}

/**
 * Like asAuthenticated but COMMITS (for RPCs whose effects must persist, e.g.
 * delete_uploader). Sets SET LOCAL ROLE authenticated + jwt claims so auth.uid()
 * resolves and SECURITY DEFINER guards that check the caller pass.
 */
export async function asAuthenticatedCommitted<T>(
	userId: string,
	fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
	return pg.begin(async (tx) => {
		await tx`SET LOCAL ROLE authenticated`;
		await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
		return fn(tx);
	}) as Promise<T>;
}

/** Tear down everything tracked in the scope. Leaves dev exactly as found. */
export async function cleanupScope(
	scope: SeedScope | undefined,
): Promise<void> {
	if (!scope) return;
	// children first (FKs), then submissions, then users (public + auth).
	if (scope.submissionIds.length > 0) {
		await pg`DELETE FROM labeled_results WHERE submission_id IN ${pg(scope.submissionIds)}`;
		await pg`DELETE FROM evaluation_assignments WHERE submission_id IN ${pg(scope.submissionIds)}`;
		await pg`DELETE FROM submissions WHERE id IN ${pg(scope.submissionIds)}`;
	}
	if (scope.userIds.length > 0) {
		await pg`DELETE FROM users WHERE id IN ${pg(scope.userIds)}`;
		for (const id of scope.userIds) {
			await admin.auth.admin.deleteUser(id).catch(() => {});
		}
	}
}

/** Count any leftover test rows by the rlstest marker (residue guard). */
export async function residueCount(): Promise<number> {
	const r =
		await pg`SELECT count(*)::int AS n FROM users WHERE email LIKE ${`${TEST_EMAIL_PREFIX}%`}`;
	return r[0].n as number;
}
