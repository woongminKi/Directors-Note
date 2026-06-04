import Link from "next/link";
import type { ReactNode } from "react";
import { requireEvaluator } from "@/lib/auth/require-evaluator";

// WS5 — 평가자 워크벤치 route group. requireEvaluator 가드(비-평가자는 홈으로).
export default async function EvaluatorLayout({
	children,
}: {
	children: ReactNode;
}) {
	const user = await requireEvaluator();

	return (
		<div className="min-h-screen bg-muted/30">
			<nav
				aria-label="주요 메뉴"
				className="flex items-center justify-between border-b bg-background px-4 py-3"
			>
				<Link href="/queue" className="text-base font-semibold">
					Director's Note · 채점
				</Link>
				<span className="text-xs text-muted-foreground">
					{user.appUser.email}
				</span>
			</nav>
			<main className="mx-auto max-w-screen-sm px-4 py-6">{children}</main>
		</div>
	);
}
