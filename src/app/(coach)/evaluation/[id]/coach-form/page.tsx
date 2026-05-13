import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { kstToday } from "@/lib/datetime";
import { db } from "@/lib/db/client";
import { evaluations } from "@/lib/db/schema";
import { CoachBulletForm } from "./form";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function CoachBulletFormPage({ params }: PageProps) {
	const { id } = await params;
	const { academyId } = await requireAuth();

	const evaluation = await db.query.evaluations.findFirst({
		where: and(eq(evaluations.id, id), eq(evaluations.academyId, academyId)),
		with: { student: true },
	});

	if (!evaluation) notFound();

	const student = (
		evaluation as { student?: { name: string; year: string | null } }
	).student;
	if (!student) notFound();

	const today = kstToday();
	const featureFlag = process.env.FEATURE_AI_VIDEO_ANALYSIS ?? "false";

	return (
		<div className="max-w-screen-sm mx-auto p-4">
			<CoachBulletForm
				evaluationId={id}
				studentId={evaluation.studentId}
				studentName={student.name}
				year={student.year ?? "미지정"}
				defaultDate={today}
				degradeReason={featureFlag === "false" ? "feature_off" : undefined}
			/>
		</div>
	);
}
