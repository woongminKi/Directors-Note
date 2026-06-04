import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireEvaluator } from "@/lib/auth/require-evaluator";
import { db } from "@/lib/db/client";
import { evaluationAssignments, submissions } from "@/lib/db/schema";
import { SUBMISSION_VIDEOS_BUCKET } from "@/lib/evaluations/constants";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { EvaluatorScoreForm } from "./form";

export const dynamic = "force-dynamic";

// 서명 다운로드 URL 유효 시간(초). 평가자가 영상을 보는 동안 충분하도록 1시간.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// WS5 — 채점 워크벤치. requireEvaluator + 본인 활성 배정 확인 →
// private submission-videos 객체에 service-role 서명 다운로드 URL 발급(영상 재생).
export default async function ScoreWorkbenchPage({
	params,
}: {
	params: Promise<{ submissionId: string }>;
}) {
	const { submissionId } = await params;
	const user = await requireEvaluator();

	// 본인 활성(status='assigned') 배정 + 제출 메타를 한 번에 조회.
	// 활성 배정이 없으면 notFound (타 평가자/만료/미배정 접근 차단 — 독립성).
	const row = await db
		.select({
			assignmentId: evaluationAssignments.id,
			isRedundantLabel: evaluationAssignments.isRedundantLabel,
			sceneType: submissions.sceneType,
			performanceYear: submissions.performanceYear,
			videoStorageUrl: submissions.videoStorageUrl,
		})
		.from(evaluationAssignments)
		.innerJoin(
			submissions,
			eq(submissions.id, evaluationAssignments.submissionId),
		)
		.where(
			and(
				eq(evaluationAssignments.submissionId, submissionId),
				eq(evaluationAssignments.evaluatorUserId, user.appUser.id),
				eq(evaluationAssignments.status, "assigned"),
			),
		)
		.limit(1);

	const assignment = row[0];
	if (!assignment) notFound();
	if (!assignment.videoStorageUrl) notFound();

	// private 객체에 service-role 서명 다운로드 URL 발급.
	const supabase = createServiceRoleClient();
	const { data: signed, error } = await supabase.storage
		.from(SUBMISSION_VIDEOS_BUCKET)
		.createSignedUrl(assignment.videoStorageUrl, SIGNED_URL_TTL_SECONDS);
	if (error || !signed) notFound();

	return (
		<EvaluatorScoreForm
			submissionId={submissionId}
			videoUrl={signed.signedUrl}
			sceneType={assignment.sceneType}
			performanceYear={assignment.performanceYear}
			isRedundantLabel={assignment.isRedundantLabel}
		/>
	);
}
