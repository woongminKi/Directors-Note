import Link from "next/link";
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/require-auth";

export default async function CoachLayout({
	children,
}: {
	children: ReactNode;
}) {
	const user = await requireAuth();
	const isOwner = user.role === "owner" || user.role === "admin";

	return (
		<div className="min-h-screen">
			<nav
				aria-label="주요 메뉴"
				className="flex items-center justify-between border-b px-4 py-3"
			>
				<div className="flex items-center gap-4">
					<Link href="/dashboard" className="text-base font-semibold">
						Director's Note
					</Link>
					<Link
						href="/dashboard"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						Dashboard
					</Link>
					<Link
						href="/students"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						학생
					</Link>
					{isOwner && (
						<Link
							href="/users/new"
							className="text-sm text-muted-foreground hover:text-foreground"
						>
							사용자 초대
						</Link>
					)}
				</div>
				<span className="text-xs text-muted-foreground">
					{user.appUser.email}
				</span>
			</nav>
			<main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
		</div>
	);
}
