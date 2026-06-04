import Link from "next/link";
import { notFound } from "next/navigation";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { requireConsumer } from "@/lib/auth/require-consumer";
import { createClient } from "@/lib/supabase/server";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";

// 4축 한국어 라벨 (루브릭 v1).
const AXES: Array<{
	key: "vocal" | "expression" | "movement" | "examReadiness";
	label: string;
	col: string;
}> = [
	{ key: "vocal", label: "발성", col: "vocal_score" },
	{ key: "expression", label: "표정", col: "expression_score" },
	{ key: "movement", label: "몸짓", col: "movement_score" },
	{ key: "examReadiness", label: "입시 완성도", col: "exam_readiness_score" },
];

type Rationale = Partial<
	Record<"vocal" | "expression" | "movement" | "examReadiness", string>
>;

// 점수 row (RLS 가 released+is_primary 라벨만 노출).
type LabelRow = {
	vocal_score: string | number;
	expression_score: string | number;
	movement_score: string | number;
	exam_readiness_score: string | number;
	holistic_grade: string;
	derived_grade: string;
	rationale: Rationale;
};

function scoreOf(row: LabelRow, col: string): number {
	return Number((row as unknown as Record<string, string | number>)[col]);
}

// WS6.1/6.3 — 소비자 결과 뷰. CONSUMER 인증 supabase client 로 조회 → RLS 적용:
//   - submissions: 본인 제출만 보임(아니면 row 없음 → notFound).
//   - labeled_results: 본인 제출이 released 이고 is_primary=true 인 라벨만 보임.
// AI 필드는 애초에 select 하지 않으며 B2C 에 존재하지도 않는다(사람 점수 only).
// raw 점수만 표시(warm letter 는 Phase A 보류 — 명세 6.3).
export default async function SubmissionResultPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	await requireConsumer(`/submissions/${id}`);
	const supabase = await createClient();

	// 본인 제출(RLS). 없으면 notFound (타인 제출/soft-deleted 접근 차단).
	const { data: submission } = await supabase
		.from("submissions")
		.select("id, scene_type, performance_year, status, paid_at")
		.eq("id", id)
		.maybeSingle();

	if (!submission) notFound();

	// released 면 primary 라벨 조회(RLS 가 released+is_primary 일 때만 반환).
	if (submission.status === "released") {
		const { data: label } = await supabase
			.from("labeled_results")
			.select(
				"vocal_score, expression_score, movement_score, exam_readiness_score, holistic_grade, derived_grade, rationale",
			)
			.eq("submission_id", id)
			.maybeSingle();

		if (!label) {
			// released 인데 RLS 로 라벨이 안 보이는 비정상 상태 — 안전하게 처리 중 표기.
			return (
				<StatusView
					sceneType={submission.scene_type}
					performanceYear={submission.performance_year}
					message="결과를 준비하고 있습니다. 잠시 후 다시 확인해 주세요."
				/>
			);
		}

		const row = label as LabelRow;
		const rationale = (row.rationale ?? {}) as Rationale;

		return (
			<div className="space-y-6">
				<header className="space-y-1">
					<h1 className="text-xl font-bold">평가 결과</h1>
					<p className="text-sm text-muted-foreground">
						{submission.scene_type}
						{submission.performance_year
							? ` · ${submission.performance_year}`
							: ""}
					</p>
				</header>

				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle>종합 등급</CardTitle>
							<span className="text-3xl font-bold">{row.derived_grade}</span>
						</div>
						<CardDescription>
							평가자 종합 판단 등급: {row.holistic_grade}
						</CardDescription>
					</CardHeader>
				</Card>

				<div className="space-y-3">
					{AXES.map((axis) => (
						<Card key={axis.key}>
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle>{axis.label}</CardTitle>
									<span className="text-lg font-semibold tabular-nums">
										{scoreOf(row, axis.col).toFixed(1)}
										<span className="text-sm font-normal text-muted-foreground">
											{" "}
											/ 10
										</span>
									</span>
								</div>
							</CardHeader>
							{rationale[axis.key] ? (
								<CardContent>
									<p className="text-sm text-foreground/90 whitespace-pre-line">
										{rationale[axis.key]}
									</p>
								</CardContent>
							) : null}
						</Card>
					))}
				</div>

				<Link
					href="/submissions"
					className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
				>
					제출 내역으로
				</Link>
			</div>
		);
	}

	// 미공개 상태 뷰.
	if (submission.status === "scored") {
		return (
			<StatusView
				sceneType={submission.scene_type}
				performanceYear={submission.performance_year}
				message="평가가 완료되었습니다. 결제 후 결과를 확인할 수 있습니다."
				action={<PayButton submissionId={id} />}
			/>
		);
	}

	return (
		<StatusView
			sceneType={submission.scene_type}
			performanceYear={submission.performance_year}
			message={
				submission.status === "assigned"
					? "평가자가 평가를 진행하고 있습니다."
					: "평가자 배정을 기다리고 있습니다."
			}
		/>
	);
}

function StatusView({
	sceneType,
	performanceYear,
	message,
	action,
}: {
	sceneType: string;
	performanceYear: string | null;
	message: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-xl font-bold">평가 진행 상황</h1>
				<p className="text-sm text-muted-foreground">
					{sceneType}
					{performanceYear ? ` · ${performanceYear}` : ""}
				</p>
			</header>
			<Card>
				<CardContent className="space-y-4 py-8 text-center">
					<p className="text-sm text-muted-foreground">{message}</p>
					{action}
				</CardContent>
			</Card>
			<Link
				href="/submissions"
				className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
			>
				제출 내역으로
			</Link>
		</div>
	);
}
