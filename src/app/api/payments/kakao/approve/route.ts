import { env } from "@/lib/env";
import { approveOrder } from "@/lib/payments/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카카오페이 결제 승인 콜백(approval_url). 같은 브라우저 세션 리다이렉트라 소비자 쿠키 유지됨.
export async function GET(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const orderId = url.searchParams.get("order");
	const pgToken = url.searchParams.get("pg_token");
	const base = env.NEXT_PUBLIC_APP_URL;

	if (!orderId || !pgToken) {
		return Response.redirect(`${base}/submissions?payment=failed`, 307);
	}
	const r = await approveOrder(orderId, pgToken);
	const dest = r.ok
		? `${base}/submissions/${r.submissionId}`
		: `${base}/submissions?payment=failed`;
	return Response.redirect(dest, 307);
}
