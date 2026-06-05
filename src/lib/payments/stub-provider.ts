import type {
	ApproveResult,
	PaymentOrderRow,
	PaymentProvider,
	ReadyContext,
	ReadyResult,
} from "@/lib/payments/types";

// 무료 파일럿: 외부 결제창 없이 주문을 바로 통과시킨다. payReady 가 이어서 approveOrder 를
// 호출해 paid_at 스탬프 + release 까지 수행 → 기존 즉시 스탬프 동작과 동치.
export class StubPaymentProvider implements PaymentProvider {
	async ready(
		order: PaymentOrderRow,
		_ctx: ReadyContext,
	): Promise<ReadyResult> {
		return {
			ok: true,
			tid: `stub_${order.id}`,
			redirectUrl: `/submissions/${order.submissionId}`,
		};
	}
	async approve(
		_order: PaymentOrderRow,
		_pgToken: string,
	): Promise<ApproveResult> {
		return { ok: true };
	}
}
