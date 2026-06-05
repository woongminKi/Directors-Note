"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluatorEarnings } from "@/lib/db/schema";
import { EVALUATOR_FEE_KRW } from "@/lib/settlement/config";

// release 시 primary 평가자에게 ₩6,000 적립(pending). UNIQUE(submission,evaluator) 로 멱등.
export async function accrueEarning(input: {
	submissionId: string;
	evaluatorUserId: string;
	paymentOrderId?: string | null;
}): Promise<void> {
	await db
		.insert(evaluatorEarnings)
		.values({
			submissionId: input.submissionId,
			evaluatorUserId: input.evaluatorUserId,
			paymentOrderId: input.paymentOrderId ?? null,
			amount: EVALUATOR_FEE_KRW,
		})
		.onConflictDoNothing({
			target: [
				evaluatorEarnings.submissionId,
				evaluatorEarnings.evaluatorUserId,
			],
		});
}

// 환불 시 해당 제출의 pending 적립을 void. 멱등(pending 행만).
export async function voidEarningsForSubmission(
	submissionId: string,
): Promise<void> {
	await db
		.update(evaluatorEarnings)
		.set({ status: "void", voidedAt: new Date() })
		.where(
			and(
				eq(evaluatorEarnings.submissionId, submissionId),
				eq(evaluatorEarnings.status, "pending"),
			),
		);
}

export type EarningRow = {
	id: string;
	submissionId: string;
	amount: number;
	status: "pending" | "void" | "paid";
	createdAt: Date;
};

// 평가자 본인/관리자 조회용(후속 UI 대비). 직결 db.
export async function listEarnings(
	evaluatorUserId: string,
): Promise<EarningRow[]> {
	return db
		.select({
			id: evaluatorEarnings.id,
			submissionId: evaluatorEarnings.submissionId,
			amount: evaluatorEarnings.amount,
			status: evaluatorEarnings.status,
			createdAt: evaluatorEarnings.createdAt,
		})
		.from(evaluatorEarnings)
		.where(eq(evaluatorEarnings.evaluatorUserId, evaluatorUserId))
		.orderBy(desc(evaluatorEarnings.createdAt));
}
