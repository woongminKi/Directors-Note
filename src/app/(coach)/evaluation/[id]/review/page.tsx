import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { feedbackDrafts } from "@/lib/db/schema";
import { getEvaluation } from "@/lib/evaluations/queries";
import { AnalysisResult } from "./analysis-result";
import { ReviewEditor } from "./review-editor";

export default async function ReviewPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const { academyId } = await requireAuth();
	const evaluation = await getEvaluation(academyId, id);
	if (!evaluation) notFound();

	const draft = await db.query.feedbackDrafts.findFirst({
		where: eq(feedbackDrafts.evaluationId, id),
	});
	if (!draft) notFound();

	if (draft.status === "sent") {
		return (
			<main className="px-4 py-6 max-w-md mx-auto">
				<h1 className="text-xl font-bold mb-4">발송 완료</h1>
				<p className="text-sm text-muted-foreground">
					이 평가는 이미 발송되었습니다.
				</p>
			</main>
		);
	}

	const student = (
		evaluation as { student?: { name: string; year: string | null } }
	).student;
	const analysis = (
		evaluation as {
			aiAnalysis?: Parameters<typeof AnalysisResult>[0]["analysis"] | null;
		}
	).aiAnalysis;

	return (
		<main className="px-4 py-6 max-w-md mx-auto space-y-4">
			<header>
				<h1 className="text-xl font-bold">
					{student?.name} 학생 · {String(evaluation.evaluationDate)}
				</h1>
				<p className="text-sm text-muted-foreground">
					{student?.year ?? "구분 미입력"}
				</p>
			</header>
			{analysis && <AnalysisResult analysis={analysis} />}
			<ReviewEditor draftId={draft.id} initialText={draft.aiDraftText} />
		</main>
	);
}
