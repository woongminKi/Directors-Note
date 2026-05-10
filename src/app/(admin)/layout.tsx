import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	await requireRole(["owner", "admin"]);
	return <div className="min-h-screen">{children}</div>;
}
