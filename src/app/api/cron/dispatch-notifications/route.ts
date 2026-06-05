import { env } from "@/lib/env";
import { drainPendingNotifications } from "@/lib/notifications/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
	// Vercel Cron 이 Authorization: Bearer ${CRON_SECRET} 자동 첨부 (sweep-assignments 와 동일).
	if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const result = await drainPendingNotifications();
	console.info("[cron/dispatch-notifications] ok", result);
	return Response.json({ ok: true, ...result });
}
