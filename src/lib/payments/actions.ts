"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireConsumer } from "@/lib/auth/require-consumer";
import { db } from "@/lib/db/client";
import { paymentOrders, submissions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { SUBMISSION_PRICE_KRW } from "@/lib/payments/config";
import {
	createPaymentProvider,
	isKakaoPayEnabled,
} from "@/lib/payments/factory";
import { releaseSubmission } from "@/lib/submissions/release-action";

export type PayReadyResult =
	| { ok: true; redirectUrl: string }
	| { ok: false; error: "not_found" | "not_payable" | "ready_failed" };

// 결제 시작: 주문 생성 + provider.ready. stub 모드면 곧바로 approveOrder 까지 수행.
export async function payReady(submissionId: string): Promise<PayReadyResult> {
	const user = await requireConsumer();

	const submission = await db.query.submissions.findFirst({
		where: and(
			eq(submissions.id, submissionId),
			eq(submissions.uploaderUserId, user.appUser.id),
			isNull(submissions.softDeletedAt),
		),
		columns: { id: true, status: true, paidAt: true },
	});
	if (!submission) return { ok: false, error: "not_found" };
	// 결제 가능 조건: 채점 완료(scored) + 미결제. 그 외(미채점/이미 결제)면 주문 생성 안 함.
	// (서버액션 직접 호출로 미채점 건 과금/중복 과금되는 구멍을 막는다.)
	if (submission.status !== "scored" || submission.paidAt !== null) {
		return { ok: false, error: "not_payable" };
	}

	const provider = isKakaoPayEnabled() ? "kakaopay" : "stub";
	const inserted = await db
		.insert(paymentOrders)
		.values({
			submissionId,
			userId: user.appUser.id,
			amount: SUBMISSION_PRICE_KRW,
			provider,
		})
		.returning();
	const order = inserted[0];

	const appUrl = env.NEXT_PUBLIC_APP_URL;
	const ready = await createPaymentProvider().ready(
		{
			id: order.id,
			submissionId: order.submissionId,
			userId: order.userId,
			amount: order.amount,
			provider: order.provider,
			providerTid: order.providerTid,
			status: order.status,
		},
		{
			itemName: "연기 평가 결과 공개",
			partnerUserId: user.appUser.id,
			approvalUrl: `${appUrl}/api/payments/kakao/approve?order=${order.id}`,
			cancelUrl: `${appUrl}/submissions/${submissionId}?payment=canceled`,
			failUrl: `${appUrl}/submissions/${submissionId}?payment=failed`,
		},
	);
	if (!ready.ok) {
		await db
			.update(paymentOrders)
			.set({ status: "failed" })
			.where(eq(paymentOrders.id, order.id));
		return { ok: false, error: "ready_failed" };
	}

	await db
		.update(paymentOrders)
		.set({ providerTid: ready.tid })
		.where(eq(paymentOrders.id, order.id));

	// stub: 외부 결제창 없이 즉시 승인까지(무료 파일럿).
	if (provider === "stub") {
		await approveOrder(order.id, "stub");
	}

	return { ok: true, redirectUrl: ready.redirectUrl };
}

// 승인 처리(콜백/스텁 공용). 멱등. 성공 시 paid_at 스탬프 + release.
export async function approveOrder(
	orderId: string,
	pgToken: string,
): Promise<{ ok: boolean; submissionId?: string }> {
	const order = await db.query.paymentOrders.findFirst({
		where: eq(paymentOrders.id, orderId),
	});
	if (!order) return { ok: false };

	if (order.status === "approved") {
		return { ok: true, submissionId: order.submissionId };
	}

	const res = await createPaymentProvider().approve(
		{
			id: order.id,
			submissionId: order.submissionId,
			userId: order.userId,
			amount: order.amount,
			provider: order.provider,
			providerTid: order.providerTid,
			status: order.status,
		},
		pgToken,
	);
	if (!res.ok) {
		await db
			.update(paymentOrders)
			.set({ status: "failed" })
			.where(eq(paymentOrders.id, orderId));
		return { ok: false };
	}

	await db
		.update(paymentOrders)
		.set({ status: "approved", approvedAt: new Date() })
		.where(eq(paymentOrders.id, orderId));

	await db
		.update(submissions)
		.set({ paidAt: new Date(), updatedAt: new Date() })
		.where(
			and(eq(submissions.id, order.submissionId), isNull(submissions.paidAt)),
		);
	await releaseSubmission(order.submissionId);

	return { ok: true, submissionId: order.submissionId };
}

export type RefundResult =
	| { ok: true }
	| {
			ok: false;
			error: "forbidden" | "not_found" | "not_refundable" | "cancel_failed";
	  };

// 관리자(CS) 전액 환불. approved 주문만. 성공 시 결과 재잠금(paid_at 해제 + released→scored).
export async function refundOrder(orderId: string): Promise<RefundResult> {
	const user = await getCurrentUser();
	if (
		!user ||
		(user.appUser.role !== "admin" && user.appUser.role !== "owner")
	) {
		return { ok: false, error: "forbidden" };
	}

	const order = await db.query.paymentOrders.findFirst({
		where: eq(paymentOrders.id, orderId),
	});
	if (!order) return { ok: false, error: "not_found" };
	if (order.status === "canceled") return { ok: true }; // 멱등
	if (order.status !== "approved")
		return { ok: false, error: "not_refundable" };

	const res = await createPaymentProvider().cancel({
		id: order.id,
		submissionId: order.submissionId,
		userId: order.userId,
		amount: order.amount,
		provider: order.provider,
		providerTid: order.providerTid,
		status: order.status,
	});
	if (!res.ok) return { ok: false, error: "cancel_failed" };

	await db
		.update(paymentOrders)
		.set({ status: "canceled", canceledAt: new Date() })
		.where(eq(paymentOrders.id, orderId));

	// 재잠금: 결제 해제(항상) + released→scored(되돌림).
	await db
		.update(submissions)
		.set({ paidAt: null, updatedAt: new Date() })
		.where(eq(submissions.id, order.submissionId));
	await db
		.update(submissions)
		.set({ status: "scored" })
		.where(
			and(
				eq(submissions.id, order.submissionId),
				eq(submissions.status, "released"),
			),
		);

	return { ok: true };
}

export type RefundableOrder = {
	id: string;
	submissionId: string;
	amount: number;
	approvedAt: Date | null;
};

// admin 환불 화면용: 환불 가능(approved) 주문 목록. 시스템 read(직결 db, RLS bypass).
export async function listRefundableOrders(): Promise<RefundableOrder[]> {
	const rows = await db
		.select({
			id: paymentOrders.id,
			submissionId: paymentOrders.submissionId,
			amount: paymentOrders.amount,
			approvedAt: paymentOrders.approvedAt,
		})
		.from(paymentOrders)
		.where(eq(paymentOrders.status, "approved"))
		.orderBy(desc(paymentOrders.approvedAt))
		.limit(100);
	return rows;
}
