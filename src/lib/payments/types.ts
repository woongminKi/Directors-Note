export type PaymentProviderName = "kakaopay" | "stub";
export type PaymentOrderStatus = "ready" | "approved" | "canceled" | "failed";

export type PaymentOrderRow = {
	id: string;
	submissionId: string;
	userId: string;
	amount: number;
	provider: PaymentProviderName;
	providerTid: string | null;
	status: PaymentOrderStatus;
};

export type ReadyContext = {
	itemName: string;
	partnerUserId: string;
	approvalUrl: string;
	cancelUrl: string;
	failUrl: string;
};

export type ReadyResult =
	| { ok: true; tid: string; redirectUrl: string }
	| { ok: false; error: string };

export type ApproveResult = { ok: true } | { ok: false; error: string };

export interface PaymentProvider {
	ready(order: PaymentOrderRow, ctx: ReadyContext): Promise<ReadyResult>;
	approve(order: PaymentOrderRow, pgToken: string): Promise<ApproveResult>;
}
