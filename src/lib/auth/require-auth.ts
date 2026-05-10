import "server-only";
import { redirect } from "next/navigation";
import { type CurrentUser, getCurrentUser } from "@/lib/auth/current-user";

export async function requireAuth(): Promise<CurrentUser> {
	const user = await getCurrentUser();
	if (!user) redirect("/login");
	return user;
}
