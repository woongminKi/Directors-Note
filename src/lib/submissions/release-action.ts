"use server";
// WS6.2 — scored→released 전이 서버액션 (release/paywall 게이트).
//
// 시스템 경로: postgres-js 직결 `db` 로 트랜잭션 원자성 확보 (score-action.ts /
// assignment/actions.ts 와 동일 스타일). 인가는 앱 레이어에서:
//   호출자는 제출 소유 소비자(uploader) 또는 admin 이어야 한다.
//
// 게이트(checkReleaseGate): status='scored' AND paid_at IS NOT NULL.
// 통과 시 한 트랜잭션 안에서
//   (1) submissions.status 'scored'→'released' (WHERE status='scored' — 멱등/안전)
//   (2) primary labeled_result 의 is_primary=true
//       primary = is_redundant_label=false 배정에 대응하는 라벨.
//       배정 join 으로 해결(평가자별 라벨이 여러 개일 수 있으므로).
// 이미 released 면 no-op 으로 ok 반환(멱등).
//
// RLS 2.4 가 released+is_primary 일 때만 소비자 SELECT 를 허용하므로, 이 전이가
// 사람 점수 공개의 유일한 게이트다.

import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import {
	evaluationAssignments,
	labeledResults,
	submissions,
} from "@/lib/db/schema";
import { notify } from "@/lib/notifications/actions";
import { checkReleaseGate } from "@/lib/submissions/release";

export type ReleaseResult =
	| { ok: true; alreadyReleased: boolean }
	| {
			ok: false;
			error: "forbidden" | "not_found" | "not_scored" | "not_paid" | "failed";
			details?: string;
	  };

export async function releaseSubmission(
	submissionId: string,
): Promise<ReleaseResult> {
	const user = await getCurrentUser();
	if (!user) return { ok: false, error: "forbidden" };

	// 소유 소비자 또는 admin 만.
	const submission = await db.query.submissions.findFirst({
		where: eq(submissions.id, submissionId),
		columns: {
			id: true,
			uploaderUserId: true,
			status: true,
			paidAt: true,
		},
	});
	if (!submission) return { ok: false, error: "not_found" };

	const isOwner = submission.uploaderUserId === user.appUser.id;
	const isAdmin = user.appUser.role === "admin";
	if (!isOwner && !isAdmin) return { ok: false, error: "forbidden" };

	const gate = checkReleaseGate({
		status: submission.status,
		paidAt: submission.paidAt,
	});
	if (!gate.allowed) {
		return { ok: false, error: gate.reason };
	}
	if (gate.alreadyReleased) {
		// 멱등: 이미 공개됨 (is_primary 는 release 시 이미 셋됨).
		return { ok: true, alreadyReleased: true };
	}

	try {
		await db.transaction(async (tx) => {
			// (1) primary 라벨 식별: is_redundant_label=false 배정에 대응하는 라벨.
			//     라벨은 (submission, evaluator) 유니크이므로 배정 join 으로 1행 해결.
			const primaryLabel = await tx
				.select({ id: labeledResults.id })
				.from(labeledResults)
				.innerJoin(
					evaluationAssignments,
					and(
						eq(evaluationAssignments.submissionId, labeledResults.submissionId),
						eq(
							evaluationAssignments.evaluatorUserId,
							labeledResults.evaluatorUserId,
						),
					),
				)
				.where(
					and(
						eq(labeledResults.submissionId, submissionId),
						eq(evaluationAssignments.isRedundantLabel, false),
					),
				)
				.limit(1);

			// (2) status scored→released (scored 인 동안에만 — 멱등/안전).
			await tx
				.update(submissions)
				.set({ status: "released", updatedAt: new Date() })
				.where(
					and(
						eq(submissions.id, submissionId),
						eq(submissions.status, "scored"),
					),
				);

			// (3) primary 라벨에만 is_primary=true (redundant 라벨은 건드리지 않음).
			if (primaryLabel[0]) {
				await tx
					.update(labeledResults)
					.set({ isPrimary: true })
					.where(eq(labeledResults.id, primaryLabel[0].id));
			}
		});
	} catch (e) {
		return {
			ok: false,
			error: "failed",
			details: e instanceof Error ? e.message : "release_failed",
		};
	}

	// 결과 공개 → uploader(소비자) 알림. notify 는 실패해도 release 를 깨지 않음.
	await notify({
		userId: submission.uploaderUserId,
		type: "submission_released",
		submissionId,
	});

	return { ok: true, alreadyReleased: false };
}
