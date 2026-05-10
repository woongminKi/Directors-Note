import { CoachBulletForm } from "./form";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function CoachBulletFormPage({ params }: PageProps) {
	const { id } = await params;

	// TODO: DB 셋업 후 evaluation/student 조회로 prefill
	// const evaluation = await db.query.evaluations.findFirst({ where: eq(evaluations.id, id), with: { student: true } })
	// 현재는 stub data 로 UI 검증

	const today = new Date().toISOString().slice(0, 10);
	const featureFlag = process.env.FEATURE_AI_VIDEO_ANALYSIS ?? "false";

	return (
		<div className="max-w-screen-sm mx-auto p-4">
			<CoachBulletForm
				studentId={id}
				studentName="박지윤"
				year="2년차"
				defaultDate={today}
				degradeReason={featureFlag === "false" ? "feature_off" : undefined}
			/>
		</div>
	);
}
