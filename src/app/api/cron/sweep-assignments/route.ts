import {
	assignQueued,
	expireOverdueAssignments,
} from "@/lib/assignment/actions";
import { env } from "@/lib/env";

// DB 직결(postgres-js) 사용 → Node 런타임 필수. 캐시 금지.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// daily 단발 + 파일럿 볼륨이라 sweep 은 빠르다. 60s 면 충분.
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
	// Vercel Cron 은 호출 시 `Authorization: Bearer ${CRON_SECRET}` 를 자동 첨부한다.
	// 동일 토큰으로 admin 수동 호출도 가능. 불일치/누락 → 401(외부 무단 호출 차단).
	if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}

	// expire 먼저: 만료 primary 를 queued 로 환원하고 만료 평가자 제외 재배정.
	// 그다음 assignQueued: 환원분 + intake 시점 미배정분을 픽업.
	// 두 sweep 모두 멱등 — 동시/중복 실행에 안전.
	const expired = await expireOverdueAssignments();
	const queued = await assignQueued();

	if (!expired.ok || !queued.ok) {
		console.error("[cron/sweep-assignments] sweep failed", { expired, queued });
		return Response.json(
			{ ok: false, error: "sweep_failed", expired, queued },
			{ status: 500 },
		);
	}

	console.info("[cron/sweep-assignments] ok", { expired, queued });
	return Response.json({ ok: true, expired, queued });
}
