import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
	return (
		<main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
			<div className="max-w-lg space-y-6">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Director&apos;s Note</h1>
					<p className="text-muted-foreground">
						연기입시학원 평가 자동화 — 영상 → AI 분석 → 한국어 부모 letter
					</p>
				</div>

				<div className="rounded-lg border bg-card p-6 text-sm text-left space-y-3">
					<div className="font-semibold">Dev preview</div>
					<p className="text-muted-foreground leading-relaxed">
						아직 Supabase 셋업 전 — auth 우회 mode 입니다. PIPA 변호사 의견 받은 후 실제 Supabase 연결.
					</p>
					<div className="flex flex-col gap-2 pt-2">
						<Link
							href="/evaluation/preview-id/coach-form"
							className={cn(buttonVariants({ size: "lg" }), "w-full justify-center h-11")}
						>
							Approach-A 코치 불릿 폼 (preview)
						</Link>
						<Link
							href="/feedback/preview-token"
							className={cn(
								buttonVariants({ variant: "outline", size: "lg" }),
								"w-full justify-center h-11",
							)}
						>
							부모 share-link 페이지 (preview)
						</Link>
					</div>
				</div>

				<div className="text-xs text-muted-foreground">
					Status: pre-product · Stub-first dev · v0.1.0
				</div>
			</div>
		</main>
	);
}
