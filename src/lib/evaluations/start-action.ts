"use server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { evaluations } from "@/lib/db/schema";

export type StartEvaluationResult =
	| { ok: true; evaluationId: string; redirectTo: string; resumed?: boolean }
	| { ok: false; error: "no_consent" | "not_found" };

const todayISO = (): string => new Date().toISOString().slice(0, 10);
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

	const existing = await db.query.evaluations.findFirst({
		where: and(
			eq(evaluations.studentId, studentId),
			eq(evaluations.evaluationDate, todayISO()),
			eq(evaluations.academyId, academyId),
		),
		with: { feedbackDraft: true },
	});

	const featureOn = process.env.FEATURE_AI_VIDEO_ANALYSIS === "true";
	const redirectFor = (id: string) =>
		featureOn ? `/evaluation/${id}` : `/evaluation/${id}/coach-form`;

	if (existing) {
		const draftStatus = (existing as { feedbackDraft?: { status: string } })
			.feedbackDraft?.status;
		if (draftStatus !== "sent") {
			return {
				ok: true,
				evaluationId: existing.id,
				redirectTo: redirectFor(existing.id),
				resumed: true,
			};
		}
	}

	const [row] = await db
		.insert(evaluations)
		.values({
			academyId,
			studentId,
			coachUserId: appUser.id,
			evaluationDate: todayISO(),
			videoStorageUrl: null,
			videoLifecycleExpiresAt: addDaysFromNow(30),
		})
		.returning({ id: evaluations.id });

	return { ok: true, evaluationId: row.id, redirectTo: redirectFor(row.id) };
}
