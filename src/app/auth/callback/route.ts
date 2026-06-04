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
		// B2B(코치/관리자)는 사전 초대된 row 만 허용. 단 B2C 소비자 인테이크
		// 플로우(next 가 /submit 로 시작)는 자가 가입이므로, 미존재 시 자동
		// 프로비저닝한다 — role='consumer', academy_id=null (WS3.6).
		const isConsumerSignup = next.startsWith("/submit");
		if (!isConsumerSignup) {
			await supabase.auth.signOut();
			return NextResponse.redirect(
				new URL("/auth/not-invited", url.origin),
				307,
			);
		}
		const meta = data.user.user_metadata ?? {};
		const metaName =
			(typeof meta.name === "string" && meta.name.trim()) ||
			(typeof meta.full_name === "string" && meta.full_name.trim()) ||
			null;
		await db.insert(users).values({
			id: data.user.id, // = auth.users.id (PK)
			academyId: null,
			role: "consumer",
			email: data.user.email,
			displayName: metaName,
		});
		return NextResponse.redirect(new URL(next, url.origin), 307);
	}

	// row.id is non-null (PK constraint) and must match auth.users.id.
	// Mismatch means the email is taken by a different auth identity → reject.
	// Pre-seeded rows are created with auth.users.id already populated via the
	// Supabase Admin invite flow (see T30 inviteUser action).
	if (row.id !== data.user.id) {
		await supabase.auth.signOut();
		return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
	}

	const meta = data.user.user_metadata ?? {};
	const metaName =
		(typeof meta.name === "string" && meta.name.trim()) ||
		(typeof meta.full_name === "string" && meta.full_name.trim()) ||
		null;
	if (metaName && row.displayName !== metaName) {
		await db
			.update(users)
			.set({ displayName: metaName, updatedAt: new Date() })
			.where(eq(users.id, row.id));
	}

	return NextResponse.redirect(new URL(next, url.origin), 307);
}
