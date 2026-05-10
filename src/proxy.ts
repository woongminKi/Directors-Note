import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
	let response = NextResponse.next({ request });

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
	const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

	// Dev stub bypass — Supabase URL 이 localhost 또는 stub 이면 auth 검사 건너뜀.
	// 실제 Supabase 셋업 (PIPA 의견 후) 시점에 자동 활성화.
	const isDevStub =
		supabaseUrl.includes("localhost") || supabaseAnon.startsWith("stub_");
	if (isDevStub) {
		return response;
	}

	const supabase = createServerClient(supabaseUrl, supabaseAnon, {
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					for (const { name, value } of cookiesToSet) {
						request.cookies.set(name, value);
					}
					response = NextResponse.next({ request });
					for (const { name, value, options } of cookiesToSet) {
						response.cookies.set(name, value, options);
					}
				},
			},
		},
	);

	// 세션 갱신 (각 요청마다 호출 — Supabase docs 권장)
	const { data } = await supabase.auth.getUser();

	const pathname = request.nextUrl.pathname;
	const isPublic =
		pathname === "/" ||
		pathname.startsWith("/login") ||
		pathname.startsWith("/signup") ||
		pathname.startsWith("/feedback/") || // 부모 share-link (인증 X)
		pathname.startsWith("/_next") ||
		pathname.startsWith("/api/auth") ||
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
		/*
		 * Match all request paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - public files (extensions like .png, .woff2)
		 */
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
	],
};
