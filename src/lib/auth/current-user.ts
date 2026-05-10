import "server-only";
import { eq } from "drizzle-orm";
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

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const appUser = await db.query.users.findFirst({
    where: eq(users.id, data.user.id),
  });
  if (!appUser) return null;

  return {
    authUser: { id: data.user.id, email: data.user.email ?? "" },
    appUser: {
      id: appUser.id,
      academyId: appUser.academyId,
      role: appUser.role as AppUser["role"],
      email: appUser.email,
    },
    academyId: appUser.academyId,
    role: appUser.role as AppUser["role"],
  };
}
