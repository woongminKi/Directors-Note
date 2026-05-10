import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/require-auth";

export default async function CoachLayout({
	children,
}: {
	children: ReactNode;
}) {
	await requireAuth();
	return (
		<div className="min-h-screen">
			{/* sidebar slot reserved for v1.x — v1 ships with topbar only */}
			{children}
		</div>
	);
}
