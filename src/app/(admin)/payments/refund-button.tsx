"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refundOrder } from "@/lib/payments/actions";

export function RefundButton({ orderId }: { orderId: string }) {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	const onRefund = async () => {
		if (!window.confirm("이 결제를 전액 환불할까요? 결과 접근이 재잠금됩니다."))
			return;
		setPending(true);
		const res = await refundOrder(orderId);
		setPending(false);
		if (res.ok) {
			toast.success("환불 처리되었습니다");
			router.refresh();
			return;
		}
		toast.error("환불에 실패했습니다.");
	};

	return (
		<Button variant="outline" size="sm" onClick={onRefund} disabled={pending}>
			{pending ? "처리 중…" : "전액 환불"}
		</Button>
	);
}
