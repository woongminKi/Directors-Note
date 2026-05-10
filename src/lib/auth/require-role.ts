import "server-only";
import { redirect } from "next/navigation";
import type { AppUser, CurrentUser } from "@/lib/auth/current-user";
import { requireAuth } from "@/lib/auth/require-auth";

export async function requireRole(
	allowed: AppUser["role"][],
): Promise<CurrentUser> {
	const user = await requireAuth();
	if (!allowed.includes(user.role)) redirect("/students");
	return user;
}
