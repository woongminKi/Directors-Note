"use server";

import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { evaluations, feedbackDrafts } from "@/lib/db/schema";
import { createLetterGenerationService } from "@/lib/evaluation/factory";
import {
	type CoachBulletFormInput,
	coachBulletFormSchema,
} from "@/lib/forms/coach-bullet-form";

export type SubmitResult =
	| { ok: true; feedbackDraftId: string; redirectTo: string }
	| {
			ok: false;
			error:
				| "validation"
				| "no_consent"
				| "not_found"
				| "duplicate"
				| "llm_failed";
			details?: string;
	  };

export async function submitCoachBulletEvaluation(
	evaluationId: string,
	input: CoachBulletFormInput,
): Promise<SubmitResult> {
	const { academyId } = await requireAuth();

	const parsed = coachBulletFormSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: "validation",
			details: parsed.error.issues[0]?.message ?? "입력값 오류",
		};
	}

	const evaluation = await db.query.evaluations.findFirst({
		where: and(
			eq(evaluations.id, evaluationId),
			eq(evaluations.academyId, academyId),
		),
		with: { student: true },
	});
	if (!evaluation) return { ok: false, error: "not_found" };

	const student = (
		evaluation as {
			student?: {
				name: string;
				year: string | null;
				parentConsentOnFileAt: Date | null;
			};
		}
	).student;
	if (!student) return { ok: false, error: "not_found" };
	if (!student.parentConsentOnFileAt) return { ok: false, error: "no_consent" };

	let letter: string;
	try {
		const letterSvc = createLetterGenerationService();
		letter = await letterSvc.generateLetter({
			type: "coach_bullets",
			bullets: input.bullets,
			student: {
				studentName: student.name,
				year: student.year ?? input.year ?? "미지정",
				evaluationDate: input.evaluationDate,
			},
		});
	} catch (err) {
		return {
			ok: false,
			error: "llm_failed",
			details: err instanceof Error ? err.message : "unknown",
		};
	}

	// Insert/update feedback_draft (1:1 with evaluation)
	const existing = await db.query.feedbackDrafts.findFirst({
		where: eq(feedbackDrafts.evaluationId, evaluationId),
	});

	let draftId: string;
	if (existing) {
		if (existing.status === "sent") return { ok: false, error: "duplicate" };
		await db
			.update(feedbackDrafts)
			.set({
				aiDraftText: letter,
				updatedAt: new Date(),
			})
			.where(eq(feedbackDrafts.id, existing.id));
		draftId = existing.id;
	} else {
		const [row] = await db
			.insert(feedbackDrafts)
			.values({
				academyId,
				evaluationId,
				aiDraftText: letter,
				status: "draft",
			})
			.returning({ id: feedbackDrafts.id });
		draftId = row.id;
	}

	return {
		ok: true,
		feedbackDraftId: draftId,
		redirectTo: `/evaluation/${evaluationId}/review`,
	};
}
