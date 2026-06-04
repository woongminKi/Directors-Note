"use server";
// WS5.2 — 평가자 채점 제출 서버액션.
//
// 평가자가 배정된 제출을 보고 4축(0–10) + 한국어 근거 + holistic 등급을 매겨
// 제출하면:
//   (1) labeled_results 1행 insert (본인 라벨, source='human', rubric_version)
//   (2) 해당 배정 status='submitted'
//   (3) primary(비-redundant) 배정이면 submissions status='scored' (assigned 일 때만)
//   (4) users.labels_completed += 1
// 위 4개를 ONE transaction 으로 묶어 부분 적용을 막는다.
//
// 인가는 앱 레이어에서 보장한다: requireEvaluator(role='evaluator', academy=null
// 계정도 통과) + 본인 활성 배정 확인.
// 쓰기는 시스템 경로(postgres-js 직결 `db`)로 수행 — WS4 actions.ts 와 동일한
// 스타일(트랜잭션 원자성 필요, assignments 는 WS2.3 상 service-role-only).
// evaluator_user_id 는 **인증된 사용자 id 로만** 채운다(클라이언트 입력 신뢰 X).
// 평가자 독립성은 read 레이어에서 보존된다(큐/워크벤치는 본인 배정·라벨만 조회).

import { and, eq, sql } from "drizzle-orm";
import { requireEvaluator } from "@/lib/auth/require-evaluator";
import { db } from "@/lib/db/client";
import {
	evaluationAssignments,
	labeledResults,
	submissions,
	users,
} from "@/lib/db/schema";
import { deriveGradeFromScores } from "@/lib/evaluation/grade-derivation";
import { JUDGE_RUBRIC_VERSION } from "@/lib/evaluation/prompts/judge-rubric-v1";
import {
	type EvaluatorScoreFormInput,
	evaluatorScoreFormSchema,
} from "@/lib/forms/evaluator-score-form";

export type ScoreSubmitResult =
	| { ok: true; redirectTo: string; derivedGrade: "A" | "B" | "C" | "D" }
	| {
			ok: false;
			error: "validation" | "not_assigned" | "failed";
			details?: string;
	  };

export async function submitEvaluatorScore(
	submissionId: string,
	input: EvaluatorScoreFormInput,
): Promise<ScoreSubmitResult> {
	const user = await requireEvaluator();

	const parsed = evaluatorScoreFormSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: "validation",
			details: parsed.error.issues[0]?.message ?? "입력값 오류",
		};
	}
	const data = parsed.data;

	// 본인 활성(status='assigned') 배정 확인 + primary 여부 캡처.
	// is_redundant_label=false → primary. 활성 배정이 없으면 채점 권한 없음.
	const assignment = await db.query.evaluationAssignments.findFirst({
		where: and(
			eq(evaluationAssignments.submissionId, submissionId),
			eq(evaluationAssignments.evaluatorUserId, user.appUser.id),
			eq(evaluationAssignments.status, "assigned"),
		),
		columns: { id: true, isRedundantLabel: true },
	});
	if (!assignment) return { ok: false, error: "not_assigned" };

	const isPrimary = !assignment.isRedundantLabel;
	const derivedGrade = deriveGradeFromScores([
		data.vocal,
		data.expression,
		data.movement,
		data.examReadiness,
	]);

	try {
		await db.transaction(async (tx) => {
			// (1) labeled_results insert — evaluator_user_id 는 인증 사용자 id.
			// 중복 제출(이미 라벨 존재) 은 UNIQUE(submission_id, evaluator_user_id)
			// 에 onConflictDoNothing 으로 no-op (멱등).
			await tx
				.insert(labeledResults)
				.values({
					submissionId,
					evaluatorUserId: user.appUser.id,
					vocalScore: String(data.vocal),
					expressionScore: String(data.expression),
					movementScore: String(data.movement),
					examReadinessScore: String(data.examReadiness),
					holisticGrade: data.holisticGrade,
					derivedGrade,
					rationale: data.rationale,
					rubricVersion: JUDGE_RUBRIC_VERSION,
					source: "human",
				})
				.onConflictDoNothing({
					target: [labeledResults.submissionId, labeledResults.evaluatorUserId],
				});

			// (2) 배정 status → submitted (활성 배정이었던 행만).
			await tx
				.update(evaluationAssignments)
				.set({ status: "submitted" })
				.where(
					and(
						eq(evaluationAssignments.id, assignment.id),
						eq(evaluationAssignments.status, "assigned"),
					),
				);

			// (3) primary 였다면 제출을 scored 로 (assigned 인 동안에만 — 멱등/안전).
			if (isPrimary) {
				await tx
					.update(submissions)
					.set({ status: "scored", updatedAt: new Date() })
					.where(
						and(
							eq(submissions.id, submissionId),
							eq(submissions.status, "assigned"),
						),
					);
			}

			// (4) 평가자 라벨 완료 카운트 증가.
			await tx
				.update(users)
				.set({
					labelsCompleted: sql`${users.labelsCompleted} + 1`,
					updatedAt: new Date(),
				})
				.where(eq(users.id, user.appUser.id));
		});
	} catch (e) {
		return {
			ok: false,
			error: "failed",
			details: e instanceof Error ? e.message : "score_submit_failed",
		};
	}

	return { ok: true, redirectTo: "/queue", derivedGrade };
}
