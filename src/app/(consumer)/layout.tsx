import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { env } from "@/lib/env";

// WS3.2 — 소비자 인테이크 route group 전체 게이트.
// FEATURE_B2C_INTAKE_OPEN=false(default) 면 prod 에 노출되지 않음(변호사 사인오프 전).
// dev 에서 플래그를 true 로 두면 진입 가능.
export default function ConsumerLayout({ children }: { children: ReactNode }) {
	if (env.FEATURE_B2C_INTAKE_OPEN !== "true") notFound();

	return (
		<div className="min-h-screen bg-muted/30">
			<header className="border-b bg-background px-4 py-3">
				<span className="text-base font-semibold">Director's Note</span>
			</header>
			<main className="mx-auto max-w-screen-sm px-4 py-6">{children}</main>
		</div>
	);
}
