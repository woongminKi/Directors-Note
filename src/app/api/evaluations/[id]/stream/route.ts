import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { aiAnalyses, feedbackDrafts } from "@/lib/db/schema";
import {
	createLetterGenerationService,
	createVideoAnalysisService,
} from "@/lib/evaluation/factory";
import type { ProgressEvent } from "@/lib/evaluation/types";
import { getEvaluation } from "@/lib/evaluations/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const { academyId } = await requireAuth();

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: ProgressEvent) =>
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
				);

			try {
				const evaluation = await getEvaluation(academyId, id);
				if (!evaluation) throw new Error("not_found");
				if (!evaluation.videoStorageUrl) throw new Error("no_video");

				const videoSvc = createVideoAnalysisService();
				const letterSvc = createLetterGenerationService();

				const analysis = await videoSvc.analyzeStreaming(
					{
						evaluationId: evaluation.id,
						academyId,
						studentVideoUrl: evaluation.videoStorageUrl,
					},
					send,
				);

				await db.insert(aiAnalyses).values({
					academyId,
					evaluationId: evaluation.id,
					vocalScore: String(analysis.axes.vocal),
					expressionScore: String(analysis.axes.expression),
					examReadinessScore: String(analysis.axes.examReadiness),
					internalGrade: analysis.internalGrade,
					calibrationMatchScore: String(analysis.calibrationMatchScore),
					evaluatorUsed: analysis.evaluatorUsed,
					cosineConfidence: analysis.cosineConfidence
						? String(analysis.cosineConfidence)
						: null,
					rawResponseJson: analysis.rawResponseJson,
				});

				send({ step: "letter_drafting" });
				const student = (
					evaluation as { student?: { name: string; year: string | null } }
				).student;
				if (!student) throw new Error("student_missing");
				const letter = await letterSvc.generateLetter({
					type: "ai_analysis",
					analysis,
					student: {
						studentName: student.name,
						year: student.year ?? "미지정",
						evaluationDate: String(evaluation.evaluationDate),
					},
				});

				await db.insert(feedbackDrafts).values({
					academyId,
					evaluationId: evaluation.id,
					aiDraftText: letter,
					status: "draft",
				});

				send({ step: "complete", analysis, letterDraft: letter });
			} catch (err) {
				send({
					step: "error",
					message: err instanceof Error ? err.message : "unknown",
					degradeTo: "approach_a",
				});
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
