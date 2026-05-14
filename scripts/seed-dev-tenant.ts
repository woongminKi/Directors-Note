/**
 * Dev seed — populate the 카타르시스 academy with a test owner + coach +
 * 5 students + a mix of evaluations / drafts so the dashboard renders
 * with non-empty data. Used for developer dogfooding while Kakao OAuth
 * approval is pending.
 *
 * Idempotent: re-running clears prior dev fixtures and re-creates them.
 *
 * Run: bun run db:seed-dev
 */

import { createClient } from "@supabase/supabase-js";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
	aiAnalyses,
	evaluations,
	feedbackDrafts,
	students,
	users,
} from "../src/lib/db/schema";
import { kstMonthFirst, kstToday } from "../src/lib/datetime";

const ACADEMY_ID = "554c68ef-3244-44a3-96a1-397185ad41ea"; // 카타르시스 연기학원

const TEST_OWNER_EMAIL = "dev-owner@catharsis.test";
const TEST_COACH_EMAIL = "dev-coach@catharsis.test";

// Dev-only password — lets `bun run e2e:auth-setup` mint E2E storageState
// fixtures via Supabase's password grant. Production Kakao OAuth flow is
// unaffected. NEVER reuse this on a non-dev account.
const DEV_PASSWORD = "Catharsis-dev-2026!";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DATABASE_URL) {
	console.error(
		"Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.\n" +
			"Run with .env.local loaded (bun loads it automatically from project root).",
	);
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const pg = postgres(DATABASE_URL, { prepare: false, max: 5 });
const db = drizzle(pg);

async function findAuthUserByEmail(email: string): Promise<string | null> {
	// listUsers paginates — search across the first few pages.
	for (let page = 1; page <= 5; page++) {
		const { data, error } = await supabase.auth.admin.listUsers({
			page,
			perPage: 100,
		});
		if (error) throw error;
		const hit = data.users.find((u) => u.email === email);
		if (hit) return hit.id;
		if (data.users.length < 100) return null;
	}
	return null;
}

async function ensureAuthUser(
	email: string,
	fullName: string,
): Promise<string> {
	const existing = await findAuthUserByEmail(email);
	if (existing) {
		// Refresh password each run so e2e:auth-setup can always sign in.
		await supabase.auth.admin.updateUserById(existing, {
			password: DEV_PASSWORD,
		});
		return existing;
	}
	const { data, error } = await supabase.auth.admin.createUser({
		email,
		password: DEV_PASSWORD,
		email_confirm: true,
		user_metadata: { full_name: fullName, provider: "dev-seed" },
	});
	if (error) throw error;
	if (!data.user) throw new Error("createUser returned no user");
	return data.user.id;
}

async function generateMagicLink(email: string): Promise<string> {
	const { data, error } = await supabase.auth.admin.generateLink({
		type: "magiclink",
		email,
		options: { redirectTo: `${APP_URL}/auth/callback?next=/dashboard` },
	});
	if (error) throw error;
	const link = data?.properties?.action_link;
	if (!link) throw new Error("generateLink returned no action_link");
	return link;
}

function daysAgoISO(days: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString().slice(0, 10);
}

async function main() {
	console.log("=== seed-dev-tenant ===");
	console.log(`Academy:        ${ACADEMY_ID}`);
	console.log(`KST today:      ${kstToday()}`);
	console.log(`KST month-first: ${kstMonthFirst()}`);

	// 1. Auth users (idempotent)
	const ownerId = await ensureAuthUser(TEST_OWNER_EMAIL, "Dev Owner");
	const coachId = await ensureAuthUser(TEST_COACH_EMAIL, "Dev Coach");
	console.log(`Owner auth.users.id: ${ownerId}`);
	console.log(`Coach auth.users.id: ${coachId}`);

	// 2. public.users — upsert
	await db
		.insert(users)
		.values([
			{
				id: ownerId,
				academyId: ACADEMY_ID,
				role: "owner",
				email: TEST_OWNER_EMAIL,
				displayName: "원장",
			},
			{
				id: coachId,
				academyId: ACADEMY_ID,
				role: "coach",
				email: TEST_COACH_EMAIL,
				displayName: "코치",
			},
		])
		.onConflictDoUpdate({
			target: users.id,
			set: {
				academyId: ACADEMY_ID,
				displayName: sql`EXCLUDED.display_name`,
				updatedAt: new Date(),
			},
		});
	console.log("public.users: 2 rows upserted");

	// 3. Clear prior dev student fixtures (cascade via FK on evaluations)
	//    Cleaner: delete evaluations + drafts first, then students.
	const oldStudents = await db
		.select({ id: students.id })
		.from(students)
		.where(eq(students.academyId, ACADEMY_ID));
	const oldStudentIds = oldStudents.map((s) => s.id);
	if (oldStudentIds.length > 0) {
		// feedback_drafts depend on evaluations.
		await db.execute(sql`
			DELETE FROM feedback_drafts
			WHERE evaluation_id IN (
				SELECT id FROM evaluations
				WHERE academy_id = ${ACADEMY_ID}
				  AND student_id IN ${sql.raw(`('${oldStudentIds.join("','")}')`)}
			)
		`);
		await db.execute(sql`
			DELETE FROM ai_analyses
			WHERE evaluation_id IN (
				SELECT id FROM evaluations
				WHERE academy_id = ${ACADEMY_ID}
				  AND student_id IN ${sql.raw(`('${oldStudentIds.join("','")}')`)}
			)
		`);
		await db
			.delete(evaluations)
			.where(inArray(evaluations.studentId, oldStudentIds));
		await db.delete(students).where(eq(students.academyId, ACADEMY_ID));
		console.log(`cleared ${oldStudentIds.length} old students + their evals`);
	}

	// 4. Insert 5 students
	const studentSpecs = [
		{ name: "김민지", year: "1년차" },
		{ name: "이서준", year: "2년차" },
		{ name: "박지우", year: "재수생" },
		{ name: "정하은", year: "1년차" },
		{ name: "최도윤", year: "2년차" },
	];
	const insertedStudents = await db
		.insert(students)
		.values(
			studentSpecs.map((s) => ({
				academyId: ACADEMY_ID,
				name: s.name,
				year: s.year,
				parentConsentOnFileAt: new Date(),
				parentConsentVersion: "v1",
			})),
		)
		.returning({ id: students.id, name: students.name });
	console.log(`students: ${insertedStudents.length} rows`);

	// 5. Evaluations + ai_analyses + feedback_drafts in a mix of states.
	//    Pattern:
	//      [0] 김민지   → no eval this month   (→ Evaluation Todo queue)
	//      [1] 이서준   → no eval this month   (→ Evaluation Todo queue)
	//      [2] 박지우   → eval today + draft   (→ Review Pending queue)
	//      [3] 정하은   → eval yesterday + sent (→ Sent Recent list)
	//      [4] 최도윤   → eval 7d ago + sent    (→ Sent Recent list, older)
	const fixtures: Array<{
		studentIdx: number;
		dateISO: string;
		draftStatus: "draft" | "sent";
		grade: "A" | "B" | "C" | "D";
		letterText: string;
		vocal: string;
		expression: string;
		examReady: string;
	}> = [
		{
			studentIdx: 2,
			dateISO: kstToday(),
			draftStatus: "draft",
			grade: "B",
			letterText:
				"박지우 학생의 이번 평가 결과를 전해드립니다. 발성에서 호흡 지지가 안정되어 가고 있고, 감정 표현의 진폭도 한 단계 넓어졌습니다. 다만 입시 무대 기준에서 클라이맥스 직전의 호흡 분배가 아직 다듬어질 여지가 있습니다.",
			vocal: "7.5",
			expression: "6.8",
			examReady: "7.0",
		},
		{
			studentIdx: 3,
			dateISO: daysAgoISO(1),
			draftStatus: "sent",
			grade: "A",
			letterText:
				"정하은 학생은 이번 평가에서 표현의 진정성과 호흡의 안정성을 모두 보여주었습니다. 1년차 중반 시점에서 보기 드문 완성도였고, 현재의 페이스대로라면 입시 무대에서도 안정적인 결과를 기대할 수 있겠습니다.",
			vocal: "8.4",
			expression: "8.6",
			examReady: "8.2",
		},
		{
			studentIdx: 4,
			dateISO: daysAgoISO(7),
			draftStatus: "sent",
			grade: "B",
			letterText:
				"최도윤 학생은 발성과 호흡에서 꾸준한 안정감을 유지하고 있습니다. 이번 주차에는 정서적 몰입의 깊이를 조금 더 끌어올리는 데 집중하면 좋겠다는 의견입니다.",
			vocal: "7.2",
			expression: "6.5",
			examReady: "6.9",
		},
	];

	for (const f of fixtures) {
		const student = insertedStudents[f.studentIdx];
		if (!student) continue;
		const [ev] = await db
			.insert(evaluations)
			.values({
				academyId: ACADEMY_ID,
				studentId: student.id,
				coachUserId: coachId,
				evaluationDate: f.dateISO,
				videoStorageUrl: null,
				videoLifecycleExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			})
			.returning({ id: evaluations.id });
		if (!ev) continue;

		await db.insert(aiAnalyses).values({
			academyId: ACADEMY_ID,
			evaluationId: ev.id,
			vocalScore: f.vocal,
			expressionScore: f.expression,
			examReadinessScore: f.examReady,
			internalGrade: f.grade,
			evaluatorUsed: "cosine",
			cosineConfidence: "0.82",
			rawResponseJson: { mode: "dev-seed", v: 1 },
		});

		const now = new Date();
		const approvedAt =
			f.draftStatus === "sent"
				? new Date(now.getTime() - 6 * 60 * 60 * 1000)
				: null;
		const sentAt =
			f.draftStatus === "sent"
				? new Date(now.getTime() - 5 * 60 * 60 * 1000)
				: null;
		// Deterministic 64-char hex placeholder so re-runs don't collide on
		// shareLinkTokenHash UNIQUE. (Real tokens are sha256(token+pepper).)
		const tokenHash =
			f.draftStatus === "sent"
				? ev.id.replace(/-/g, "") + "deadbeef".repeat(4)
				: null;

		await db.insert(feedbackDrafts).values({
			academyId: ACADEMY_ID,
			evaluationId: ev.id,
			aiDraftText: f.letterText,
			coachEditedText: f.draftStatus === "sent" ? f.letterText : null,
			status: f.draftStatus,
			approvedAt,
			sentAt,
			shareLinkTokenHash: tokenHash,
			shareLinkExpiresAt:
				f.draftStatus === "sent"
					? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
					: null,
		});
	}
	console.log(`evaluations: ${fixtures.length} rows (with ai_analyses + drafts)`);

	// 6. Magic links — owner + coach. User clicks to log in.
	const ownerLink = await generateMagicLink(TEST_OWNER_EMAIL);
	const coachLink = await generateMagicLink(TEST_COACH_EMAIL);

	console.log("\n=== Magic links (open in browser to log in) ===");
	console.log(`Owner: ${ownerLink}`);
	console.log(`Coach: ${coachLink}`);
	console.log(
		"\nTip: each link is single-use and expires (~1 hour). Re-run this " +
			"script to mint new ones.",
	);

	await pg.end();
	console.log("\n✓ Seed complete");
}

main().catch((err) => {
	console.error(err);
	pg.end({ timeout: 1 }).catch(() => {});
	process.exit(1);
});
