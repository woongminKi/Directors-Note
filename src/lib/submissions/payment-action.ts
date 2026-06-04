"use server";
// WS7 — 결제(Phase A 최소 stub).
//
// submissions.paid_at 이 단일 결제 프리미티브 (academies billing 은 B2B seat 라 무관,
// 확장하지 않는다). 환불/정산/실 PG 는 Phase A 범위 밖.
//
// FEATURE_PAYMENT_ENABLED:
//   'false'(default) → stub: paid_at=now() 즉시 스탬프(친구 학원 무료 파일럿).
//                      이어서 releaseSubmission 을 자동 호출해 소비자 플로우를 한 번에
//                      완료(단, 함수는 분리 유지 — release-action.ts).
//   'true'           → 한국 PG(Toss/카카오페이 — 미결) webhook 경로. Phase A 미구현 →
//                      payment_not_configured 반환(placeholder).
//
// 인가: requireConsumer + 본인 제출 확인(앱 레이어). 시스템 쓰기는 직결 `db`.

import { and, eq, isNull } from "drizzle-orm";
import { requireConsumer } from "@/lib/auth/require-consumer";
import { db } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { resolvePaymentMode } from "@/lib/submissions/release";
import { releaseSubmission } from "@/lib/submissions/release-action";

export type PayResult =
	| { ok: true; mode: "stub"; released: boolean }
	| {
			ok: false;
			error: "not_found" | "payment_not_configured" | "failed";
			details?: string;
	  };

export async function payForSubmission(
	submissionId: string,
): Promise<PayResult> {
	const user = await requireConsumer();

	// 본인 제출 확인 (soft-deleted 제외).
	const submission = await db.query.submissions.findFirst({
		where: and(
			eq(submissions.id, submissionId),
			eq(submissions.uploaderUserId, user.appUser.id),
			isNull(submissions.softDeletedAt),
		),
		columns: { id: true, paidAt: true },
	});
	if (!submission) return { ok: false, error: "not_found" };

	const mode = resolvePaymentMode(env.FEATURE_PAYMENT_ENABLED);

	// real PG 경로는 Phase A 미구현 (webhook 으로 paid_at 스탬프할 자리).
	if (mode === "payment_not_configured") {
		return { ok: false, error: "payment_not_configured" };
	}

	// stub: paid_at 즉시 스탬프 (이미 결제됐으면 그대로 둠 — 멱등).
	try {
		if (!submission.paidAt) {
			await db
				.update(submissions)
				.set({ paidAt: new Date(), updatedAt: new Date() })
				.where(
					and(
						eq(submissions.id, submissionId),
						eq(submissions.uploaderUserId, user.appUser.id),
						isNull(submissions.paidAt),
					),
				);
		}
	} catch (e) {
		return {
			ok: false,
			error: "failed",
			details: e instanceof Error ? e.message : "payment_failed",
		};
	}

	// stub 모드: 결제 직후 release 를 자동 호출해 무료 파일럿 플로우를 한 번에 완료.
	// status='scored' + paid_at 게이트를 release 가 자체 검증하므로, 아직 scored 가
	// 아니면 release 는 not_scored 로 no-op — 결제 자체는 성공으로 둔다.
	const released = await releaseSubmission(submissionId);

	return { ok: true, mode: "stub", released: released.ok };
}
