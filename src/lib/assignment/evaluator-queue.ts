import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluationAssignments, submissions } from "@/lib/db/schema";

export type EvaluatorQueueItem = {
	assignmentId: string;
	submissionId: string;
	sceneType: string;
	dueAt: Date;
	isRedundantLabel: boolean;
};

// WS5.3 — 평가자 본인의 오픈(status='assigned') 배정 + 제출 메타.
// **본인 배정만** 조회한다 (evaluator_user_id = 인증 사용자). 학생 이름 등
// 신원 정보는 노출하지 않는다 — 중립 라벨(submission id 축약 + sceneType + 마감)만.
export async function getEvaluatorOpenAssignments(
	evaluatorUserId: string,
): Promise<EvaluatorQueueItem[]> {
	const rows = await db
		.select({
			assignmentId: evaluationAssignments.id,
			submissionId: evaluationAssignments.submissionId,
			sceneType: submissions.sceneType,
			dueAt: evaluationAssignments.dueAt,
			isRedundantLabel: evaluationAssignments.isRedundantLabel,
		})
		.from(evaluationAssignments)
		.innerJoin(
			submissions,
			eq(submissions.id, evaluationAssignments.submissionId),
		)
		.where(
			and(
				eq(evaluationAssignments.evaluatorUserId, evaluatorUserId),
				eq(evaluationAssignments.status, "assigned"),
			),
		)
		.orderBy(asc(evaluationAssignments.dueAt));

	return rows;
}
