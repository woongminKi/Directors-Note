"use server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { kstToday } from "@/lib/datetime";
import { db } from "@/lib/db/client";
import { evaluations } from "@/lib/db/schema";

export type StartEvaluationResult =
	| { ok: true; evaluationId: string; redirectTo: string; resumed?: boolean }
	| { ok: false; error: "no_consent" | "not_found" };

const addDaysFromNow = (days: number): Date => {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return d;
};

export async function startEvaluation(
	studentId: string,
): Promise<StartEvaluationResult> {
	const { academyId, appUser } = await requireAuth();

	const student = await db.query.students.findFirst({
		where: (s, { eq, and, isNull }) =>
			and(
				eq(s.id, studentId),
				eq(s.academyId, academyId),
				isNull(s.softDeletedAt),
			),
	});
	if (!student) return { ok: false, error: "not_found" };
	if (!student.parentConsentOnFileAt) return { ok: false, error: "no_consent" };

	const today = kstToday();

	const featureOn = process.env.FEATURE_AI_VIDEO_ANALYSIS === "true";
	const redirectFor = (id: string) =>
		featureOn ? `/evaluation/${id}` : `/evaluation/${id}/coach-form`;

	const existing = await db.query.evaluations.findFirst({
		where: and(
			eq(evaluations.studentId, studentId),
			eq(evaluations.evaluationDate, today),
			eq(evaluations.academyId, academyId),
		),
	});
	if (existing) {
		return {
			ok: true,
			evaluationId: existing.id,
			redirectTo: redirectFor(existing.id),
			resumed: true,
		};
	}

	// Race-safe insert. UNIQUE (student_id, evaluation_date) — 0005 — prevents
	// duplicates if two requests fall through the findFirst above concurrently.
	const inserted = await db
		.insert(evaluations)
		.values({
			academyId,
			studentId,
			coachUserId: appUser.id,
			evaluationDate: today,
			videoStorageUrl: null,
			videoLifecycleExpiresAt: addDaysFromNow(30),
		})
		.onConflictDoNothing({
			target: [evaluations.studentId, evaluations.evaluationDate],
		})
		.returning({ id: evaluations.id });

	if (inserted[0]) {
		return {
			ok: true,
			evaluationId: inserted[0].id,
			redirectTo: redirectFor(inserted[0].id),
		};
	}

	// Conflict: another request inserted the same (student_id, today) row.
	// Re-fetch and return as resumed.
	const winner = await db.query.evaluations.findFirst({
		where: and(
			eq(evaluations.studentId, studentId),
			eq(evaluations.evaluationDate, today),
			eq(evaluations.academyId, academyId),
		),
	});
	if (!winner) return { ok: false, error: "not_found" };
	return {
		ok: true,
		evaluationId: winner.id,
		redirectTo: redirectFor(winner.id),
		resumed: true,
	};
}
