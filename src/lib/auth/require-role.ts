import "server-only";
import { redirect } from "next/navigation";
import type { AppUser } from "@/lib/auth/current-user";
import { type AcademyUser, requireAuth } from "@/lib/auth/require-auth";

export async function requireRole(
	allowed: AppUser["role"][],
): Promise<AcademyUser> {
	const user = await requireAuth();
	if (!allowed.includes(user.role)) redirect("/students");
	return user;
}
