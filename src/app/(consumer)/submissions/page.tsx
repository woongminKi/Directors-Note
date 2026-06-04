import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { requireConsumer } from "@/lib/auth/require-consumer";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 제출 상태 → 소비자용 한국어 라벨/뱃지 변형.
const STATUS_META: Record<
	string,
	{ label: string; variant: "default" | "secondary" | "outline" }
> = {
	queued: { label: "평가 대기 중", variant: "secondary" },
	assigned: { label: "평가 진행 중", variant: "secondary" },
	scored: { label: "결제 후 결과 공개", variant: "outline" },
	released: { label: "결과 공개됨", variant: "default" },
};

// WS6 — 소비자 본인 제출 목록. CONSUMER 인증 supabase client 로 조회(RLS 적용:
// uploader_user_id=auth.uid() AND soft_deleted_at IS NULL 인 제출만 보임).
export default async function SubmissionsListPage() {
	await requireConsumer("/submissions");
	const supabase = await createClient();

	const { data: rows } = await supabase
		.from("submissions")
		.select("id, scene_type, performance_year, status, created_at")
		.order("created_at", { ascending: false });

	const submissions = rows ?? [];

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-xl font-bold">내 제출 내역</h1>
				<p className="text-sm text-muted-foreground">
					제출한 영상의 평가 진행 상황과 결과를 확인할 수 있습니다.
				</p>
			</header>

			{submissions.length === 0 ? (
				<Card>
					<CardContent className="py-8 text-center text-sm text-muted-foreground">
						아직 제출한 영상이 없습니다.
					</CardContent>
				</Card>
			) : (
				<ul className="space-y-3">
					{submissions.map((s) => {
						const meta = STATUS_META[s.status] ?? {
							label: s.status,
							variant: "secondary" as const,
						};
						return (
							<li key={s.id}>
								<Link href={`/submissions/${s.id}`} className="block">
									<Card className="transition-colors hover:ring-foreground/20">
										<CardHeader>
											<div className="flex items-center justify-between gap-2">
												<CardTitle>{s.scene_type}</CardTitle>
												<Badge variant={meta.variant}>{meta.label}</Badge>
											</div>
											{s.performance_year ? (
												<CardDescription>{s.performance_year}</CardDescription>
											) : null}
										</CardHeader>
									</Card>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
