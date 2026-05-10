import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const rawNext = url.searchParams.get("next") ?? "/students";
	const next =
		rawNext.startsWith("/") && !rawNext.startsWith("//")
			? rawNext
			: "/students";

	if (!code) {
		return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
	}

	const supabase = await createClient();
	const { error: exchangeError } =
		await supabase.auth.exchangeCodeForSession(code);
	if (exchangeError) {
		return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
	}

	const { data, error } = await supabase.auth.getUser();
	if (error || !data.user || !data.user.email) {
		return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
	}

	const row = await db.query.users.findFirst({
		where: eq(users.email, data.user.email),
	});

	if (!row) {
		await supabase.auth.signOut();
		return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
	}

	// row.id is non-null (PK constraint) and must match auth.users.id.
	// Mismatch means the email is taken by a different auth identity → reject.
	// Pre-seeded rows are created with auth.users.id already populated via the
	// Supabase Admin invite flow (see T30 inviteUser action).
	if (row.id !== data.user.id) {
		await supabase.auth.signOut();
		return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
	}

	return NextResponse.redirect(new URL(next, url.origin), 307);
}
