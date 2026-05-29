/**
 * One-time pilot cleanup — purge dev/test data before the friend academy's
 * real students land in this (now-production) Supabase project.
 *
 * 2026-05-29 decision: the pilot reuses the existing Supabase project as prod.
 * Before go-live we remove all test artifacts so they don't mix with real
 * (minor / biometric-consent) data.
 *
 * DELETES (FK-safe order):
 *   feedback_drafts → ai_analyses → evaluations → students (ALL — every current
 *   row is dev/seed/E2E test data; the friend hasn't added real students yet),
 *   then the test login accounts dev-owner@catharsis.test / dev-coach@catharsis.test
 *   from public.users AND auth.users.
 *
 * KEEPS: academies, reference_videos + embeddings, and every public.users /
 *   auth.users row whose email is NOT *@catharsis.test (e.g. the founder's real
 *   Kakao account that owns the academy).
 *
 * SAFE BY DEFAULT: dry-run (prints counts only). Set CONFIRM_PURGE=1 to execute.
 *
 * Run (dry-run):  bun --env-file=.env.local.prod run scripts/purge-pilot-test-data.ts
 * Run (execute):  CONFIRM_PURGE=1 bun --env-file=.env.local.prod run scripts/purge-pilot-test-data.ts
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DATABASE_URL) {
	console.error(
		"Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.",
	);
	process.exit(1);
}

const TEST_EMAIL_PATTERN = "%@catharsis.test";
const DRY_RUN = process.env.CONFIRM_PURGE !== "1";

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
	console.log(`=== purge-pilot-test-data (${DRY_RUN ? "DRY-RUN" : "EXECUTE"}) ===`);

	// Snapshot what will be removed vs kept.
	const [fd] = await sql`SELECT count(*)::int n FROM feedback_drafts`;
	const [ai] = await sql`SELECT count(*)::int n FROM ai_analyses`;
	const [ev] = await sql`SELECT count(*)::int n FROM evaluations`;
	const [st] = await sql`SELECT count(*)::int n FROM students`;
	const testUsers = await sql`
		SELECT id, email FROM public.users WHERE email LIKE ${TEST_EMAIL_PATTERN}`;
	const keepUsers = await sql`
		SELECT email, role FROM public.users WHERE email NOT LIKE ${TEST_EMAIL_PATTERN}`;
	const [rv] = await sql`SELECT count(*)::int n FROM reference_videos`;

	console.log("WILL DELETE:");
	console.log(`  feedback_drafts: ${fd.n}`);
	console.log(`  ai_analyses:     ${ai.n}`);
	console.log(`  evaluations:     ${ev.n}`);
	console.log(`  students:        ${st.n} (all)`);
	console.log(
		`  test users:      ${testUsers.length} (${testUsers.map((u) => u.email).join(", ") || "none"})`,
	);
	console.log("WILL KEEP:");
	console.log(
		`  real users:      ${keepUsers.length} (${keepUsers.map((u) => `${u.email}[${u.role}]`).join(", ") || "none"})`,
	);
	console.log(`  reference_videos: ${rv.n} (untouched)`);
	console.log("  academies:        untouched");

	if (DRY_RUN) {
		console.log("\nDRY-RUN — nothing deleted. Re-run with CONFIRM_PURGE=1 to execute.");
		return;
	}

	// HARD SAFEGUARD — this script must NEVER remove a real login account
	// (e.g. the founder's Kakao account that owns the academy). Per explicit
	// instruction (2026-05-29), only *@catharsis.test test accounts may be
	// deleted. Abort entirely if the targeted set somehow contains anything else.
	const nonTest = testUsers.filter((u) => !u.email.endsWith("@catharsis.test"));
	if (nonTest.length > 0) {
		console.error(
			`ABORT — refusing to delete non-test accounts: ${nonTest.map((u) => u.email).join(", ")}`,
		);
		process.exit(1);
	}

	console.log("\nExecuting purge...");
	// FK-safe order. Truncate-by-delete (small data).
	await sql`DELETE FROM feedback_drafts`;
	await sql`DELETE FROM ai_analyses`;
	await sql`DELETE FROM evaluations`;
	await sql`DELETE FROM students`;
	// Scoped strictly to the test email pattern — real/founder accounts untouched.
	await sql`DELETE FROM public.users WHERE email LIKE ${TEST_EMAIL_PATTERN}`;
	console.log("  public rows cleared.");

	// Remove ONLY the test auth.users login accounts. Per-row re-check of the
	// test pattern (defense-in-depth) so a real account can never be deleted here.
	for (const u of testUsers) {
		if (!u.email.endsWith("@catharsis.test")) {
			console.log(`  SKIP (not a test account): ${u.email}`);
			continue;
		}
		const { error } = await supabase.auth.admin.deleteUser(u.id);
		console.log(`  auth.users delete ${u.email}: ${error ? `FAILED ${error.message}` : "ok"}`);
	}

	// Verify.
	const [stAfter] = await sql`SELECT count(*)::int n FROM students`;
	const [uAfter] = await sql`SELECT count(*)::int n FROM public.users`;
	console.log(`\nAfter: students=${stAfter.n}, public.users=${uAfter.n}`);
	console.log("✓ Purge complete. Academy + real owner + reference data preserved.");
}

main()
	.catch((e) => {
		console.error("ERR:", e instanceof Error ? e.message : e);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
