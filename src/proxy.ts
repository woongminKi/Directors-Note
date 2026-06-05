import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
	let response = NextResponse.next({ request });

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
	const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

	const supabase = createServerClient(supabaseUrl, supabaseAnon, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet) {
				for (const { name, value } of cookiesToSet)
					request.cookies.set(name, value);
				response = NextResponse.next({ request });
				for (const { name, value, options } of cookiesToSet)
					response.cookies.set(name, value, options);
			},
		},
	});

	const { data } = await supabase.auth.getUser();

	const pathname = request.nextUrl.pathname;
	const isPublic =
		pathname === "/" ||
		pathname.startsWith("/login") ||
		pathname.startsWith("/auth/") ||
		pathname.startsWith("/feedback/") ||
		pathname.startsWith("/privacy") ||
		pathname.startsWith("/parent-consent") ||
		pathname.startsWith("/_next") ||
		pathname.startsWith("/api/auth") ||
		// cron 엔드포인트는 자체 CRON_SECRET bearer 인증을 수행하므로 세션 인증을
		// 면제한다. 빼지 않으면 세션 없는 Vercel cron 호출이 /login 으로 307 됨.
		pathname.startsWith("/api/cron") ||
		pathname.startsWith("/fonts") ||
		pathname.startsWith("/favicon");

	if (!isPublic && !data.user) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		url.searchParams.set("next", pathname);
		return NextResponse.redirect(url);
	}

	return response;
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
	],
};
