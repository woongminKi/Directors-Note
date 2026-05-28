"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const inviteSchema = z.object({
	email: z.string().email("올바른 이메일 형식이 아닙니다"),
	role: z.enum(["coach", "admin"]),
});

export type InviteUserResult = { ok: true } | { ok: false; error: string };

// NOTE: Invite UI is hidden in v1 (see page.tsx banner) pending T30 —
// auth.users id mismatch when invitee signs in via Kakao OAuth after
// inviteUserByEmail. Action logic preserved for tests + post-T30 reactivation.
export async function inviteUser(
	input: z.infer<typeof inviteSchema>,
): Promise<InviteUserResult> {
	const { academyId } = await requireRole(["owner", "admin"]);
	const parsed = inviteSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "검증 실패" };
	}

	// Check if email already in users table
	const existing = await db.query.users.findFirst({
		where: eq(users.email, parsed.data.email),
	});
	if (existing) return { ok: false, error: "이미 등록된 이메일입니다" };

	// Pre-create auth.users via Supabase Admin API → get a known auth ID
	const supabase = createServiceRoleClient();
	const { data: authData, error: authError } =
		await supabase.auth.admin.inviteUserByEmail(parsed.data.email);
	if (authError || !authData?.user) {
		return { ok: false, error: authError?.message ?? "초대 메일 전송 실패" };
	}

	// INSERT into public.users with the known auth ID
	try {
		await db.insert(users).values({
			id: authData.user.id,
			academyId,
			email: parsed.data.email,
			role: parsed.data.role,
		});
	} catch (err) {
		// rollback: delete the auth.users row we just created
		await supabase.auth.admin.deleteUser(authData.user.id);
		return {
			ok: false,
			error: err instanceof Error ? err.message : "DB 저장 실패",
		};
	}

	revalidatePath("/admin/users");
	return { ok: true };
}

// useActionState-compatible wrapper for the invite form.
// prev state is ignored; redirect happens server-side on success.
export async function inviteUserAction(
	_prev: InviteUserResult | null,
	formData: FormData,
): Promise<InviteUserResult> {
	const { redirect } = await import("next/navigation");
	const res = await inviteUser({
		email: String(formData.get("email") ?? ""),
		role: String(formData.get("role") ?? "coach") as "coach" | "admin",
	});
	if (res.ok) redirect("/students");
	return res;
}
