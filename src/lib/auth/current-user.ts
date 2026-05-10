import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
	id: string;
	academyId: string;
	role: "owner" | "coach" | "admin";
	email: string;
};

export type CurrentUser = {
	authUser: { id: string; email: string };
	appUser: AppUser;
	academyId: string;
	role: AppUser["role"];
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
	const supabase = await createClient();
	const { data, error } = await supabase.auth.getUser();
	if (error || !data.user || !data.user.email) return null;

	const appUser = await db.query.users.findFirst({
		where: eq(users.id, data.user.id),
	});
	if (!appUser) return null;

	return {
		authUser: { id: data.user.id, email: data.user.email },
		appUser: {
			id: appUser.id,
			academyId: appUser.academyId,
			role: appUser.role,
			email: appUser.email,
		},
		academyId: appUser.academyId,
		role: appUser.role,
	};
});
