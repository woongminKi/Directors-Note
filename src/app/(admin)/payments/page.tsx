import { RefundButton } from "@/app/(admin)/payments/refund-button";
import { listRefundableOrders } from "@/lib/payments/actions";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
	const orders = await listRefundableOrders();

	return (
		<main className="mx-auto max-w-3xl p-6">
			<h1 className="mb-4 text-xl font-semibold">결제 환불 (관리자)</h1>
			{orders.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					환불 가능한 결제가 없습니다.
				</p>
			) : (
				<ul className="divide-y">
					{orders.map((o) => (
						<li
							key={o.id}
							className="flex items-center justify-between gap-4 py-3"
						>
							<div className="text-sm">
								<div className="font-mono text-xs text-muted-foreground">
									{o.id}
								</div>
								<div>
									제출 {o.submissionId.slice(0, 8)} · {"·"}
									{o.amount.toLocaleString()}원
								</div>
							</div>
							<RefundButton orderId={o.id} />
						</li>
					))}
				</ul>
			)}
		</main>
	);
}
