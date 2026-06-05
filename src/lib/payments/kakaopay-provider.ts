import { env } from "@/lib/env";
import type {
	ApproveResult,
	CancelResult,
	PaymentOrderRow,
	PaymentProvider,
	ReadyContext,
	ReadyResult,
} from "@/lib/payments/types";

// ⚠️ 현행 카카오페이 Open API 기준 — 구현 시 공식 문서로 엔드포인트/인증/CID 재확인.
const BASE = "https://open-api.kakaopay.com/online/v1/payment";

function authHeaders(): HeadersInit {
	return {
		Authorization: `SECRET_KEY ${env.KAKAO_PAY_SECRET_KEY ?? ""}`,
		"Content-Type": "application/json",
	};
}
const CID = () => env.KAKAO_PAY_CID ?? "TC0ONETIME";

export class KakaoPayProvider implements PaymentProvider {
	async ready(order: PaymentOrderRow, ctx: ReadyContext): Promise<ReadyResult> {
		try {
			const res = await fetch(`${BASE}/ready`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					cid: CID(),
					partner_order_id: order.id,
					partner_user_id: ctx.partnerUserId,
					item_name: ctx.itemName,
					quantity: 1,
					total_amount: order.amount,
					tax_free_amount: 0,
					approval_url: ctx.approvalUrl,
					cancel_url: ctx.cancelUrl,
					fail_url: ctx.failUrl,
				}),
			});
			if (!res.ok) return { ok: false, error: `ready_http_${res.status}` };
			const data = (await res.json()) as {
				tid?: string;
				next_redirect_pc_url?: string;
			};
			if (!data.tid || !data.next_redirect_pc_url)
				return { ok: false, error: "ready_bad_response" };
			return {
				ok: true,
				tid: data.tid,
				redirectUrl: data.next_redirect_pc_url,
			};
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : "ready_failed",
			};
		}
	}

	async approve(
		order: PaymentOrderRow,
		pgToken: string,
	): Promise<ApproveResult> {
		if (!order.providerTid) return { ok: false, error: "missing_tid" };
		try {
			const res = await fetch(`${BASE}/approve`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					cid: CID(),
					tid: order.providerTid,
					partner_order_id: order.id,
					partner_user_id: order.userId,
					pg_token: pgToken,
				}),
			});
			if (!res.ok) return { ok: false, error: `approve_http_${res.status}` };
			return { ok: true };
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : "approve_failed",
			};
		}
	}

	async cancel(order: PaymentOrderRow): Promise<CancelResult> {
		if (!order.providerTid) return { ok: false, error: "missing_tid" };
		try {
			const res = await fetch(`${BASE}/cancel`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					cid: CID(),
					tid: order.providerTid,
					cancel_amount: order.amount,
					cancel_tax_free_amount: 0,
				}),
			});
			if (!res.ok) return { ok: false, error: `cancel_http_${res.status}` };
			return { ok: true };
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : "cancel_failed",
			};
		}
	}
}
