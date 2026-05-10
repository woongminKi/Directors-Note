import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEvaluation } from "@/lib/evaluations/queries";
import { VideoUploadFlow } from "./components/video-upload-flow";

export default async function EvaluationPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (process.env.FEATURE_AI_VIDEO_ANALYSIS !== "true") {
		redirect(`/evaluation/${id}/coach-form`);
	}

	const { academyId } = await requireAuth();
	const evaluation = await getEvaluation(academyId, id);
	if (!evaluation) notFound();

	const student = (
		evaluation as { student?: { name: string; year: string | null } }
	).student;
	return (
		<main className="px-4 py-6 max-w-md mx-auto">
			<header className="mb-4">
				<h1 className="text-xl font-bold">{student?.name} 학생</h1>
				<p className="text-sm text-muted-foreground">
					{student?.year ?? "구분 미입력"} · {String(evaluation.evaluationDate)}
				</p>
			</header>
			<VideoUploadFlow
				evaluationId={id}
				hasVideo={!!evaluation.videoStorageUrl}
			/>
		</main>
	);
}
