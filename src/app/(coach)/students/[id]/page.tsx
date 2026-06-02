import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/require-auth";
import { kstToday } from "@/lib/datetime";
import {
	getRecentEvaluationsForStudent,
	getStudent,
} from "@/lib/students/queries";
import { cn } from "@/lib/utils";
import { ArchiveConfirm } from "../components/archive-confirm";
import { ConsentGuidanceCard } from "./consent-guidance-card";
import { StartEvaluationButton } from "./start-evaluation-button";

export default async function StudentDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const { academyId, role } = await requireAuth();
	const student = await getStudent(academyId, id);
	if (!student) notFound();

	const recent = await getRecentEvaluationsForStudent(academyId, id);
	const canManage = role === "owner" || role === "admin";
	const canEvaluate = !!student.parentConsentOnFileAt;

	return (
		<main className="px-4 py-6 max-w-md mx-auto">
			<Link href="/students" className="text-sm text-muted-foreground">
				◀ 학생 목록
			</Link>
			<h1 className="text-xl font-bold mt-2">{student.name}</h1>
			<p className="text-sm text-muted-foreground mb-4">
				{student.year ?? "구분 미입력"} ·{" "}
				{student.parentConsentOnFileAt
					? `동의 ✓ ${kstToday(new Date(student.parentConsentOnFileAt))}`
					: "동의 미제출"}
			</p>
			{!student.parentConsentOnFileAt && (
				<ConsentGuidanceCard
					studentId={student.id}
					canRecordConsent={canManage}
				/>
			)}
			<StartEvaluationButton studentId={student.id} disabled={!canEvaluate} />
			<section className="mt-6">
				<h2 className="text-sm font-semibold text-muted-foreground mb-2">
					최근 평가
				</h2>
				{recent.length === 0 ? (
					<p className="text-sm text-muted-foreground">평가 내역이 없습니다</p>
				) : (
					<ul className="space-y-1">
						{recent.map((r) => (
							<li key={r.id} className="text-sm">
								<Link
									href={`/evaluation/${r.id}/review`}
									className="hover:underline"
								>
									{String(r.evaluationDate)} · {r.status ?? "draft"}
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
			{canManage && (
				<div className="mt-8 space-y-2">
					<Link
						href={`/students/${id}/edit`}
						className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
					>
						학생 정보 수정
					</Link>
					<ArchiveConfirm studentId={id} />
				</div>
			)}
		</main>
	);
}
