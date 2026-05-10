"use server";

import { revalidatePath } from "next/cache";
import {
	type CoachBulletFormInput,
	coachBulletFormSchema,
} from "@/lib/forms/coach-bullet-form";
import { createLetterGenerationService } from "@/lib/evaluation/factory";

export type SubmitResult =
	| { ok: true; feedbackDraftId: string }
	| {
			ok: false;
			error: "validation" | "no_consent" | "duplicate" | "llm_failed";
			details?: string;
	  };

export async function submitCoachBulletEvaluation(
	input: CoachBulletFormInput,
): Promise<SubmitResult> {
	// 1. 서버 검증
	const parsed = coachBulletFormSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: "validation",
			details: parsed.error.issues[0]?.message ?? "입력값 오류",
		};
	}

	// 2. 학생 부모 동의 확인 (DB 미연결 단계 — 구현은 Drizzle 셋업 후)
	// TODO: const student = await db.query.students.findFirst({ where: eq(students.id, input.studentId) })
	// TODO: if (!student?.parentConsentOnFileAt) return { ok: false, error: 'no_consent' }

	// 3. evaluation row INSERT (Approach-A 는 video_storage_url=NULL)
	// TODO: const evaluation = await db.insert(evaluations).values({...}).returning()

	// 4. LetterGenerationService 호출
	let letter: string;
	try {
		const letterSvc = createLetterGenerationService();
		letter = await letterSvc.generateLetter({
			type: "coach_bullets",
			bullets: input.bullets,
			student: {
				studentName: "박지윤", // TODO: students 조회
				year: input.year,
				evaluationDate: input.evaluationDate,
			},
		});
	} catch (err) {
		console.error("[submitCoachBulletEvaluation] LLM failed:", err);
		return {
			ok: false,
			error: "llm_failed",
			details: err instanceof Error ? err.message : "unknown",
		};
	}

	// 5. feedback_drafts INSERT
	// TODO: const draft = await db.insert(feedbackDrafts).values({ aiDraftText: letter, status: 'draft', ... }).returning()
	const fakeDraftId = "00000000-0000-4000-8000-000000000000"; // stub until DB

	revalidatePath(`/evaluation/${input.studentId}`);
	return { ok: true, feedbackDraftId: fakeDraftId };
}
