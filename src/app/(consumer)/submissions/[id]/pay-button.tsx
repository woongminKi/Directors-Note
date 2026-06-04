"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { payForSubmission } from "@/lib/submissions/payment-action";

// WS7 — 결제하기 버튼. stub 모드면 payForSubmission 이 paid_at 스탬프 + release
// 자동 호출 → router.refresh 로 공개된 결과를 다시 그린다. real PG 미구성 시
// payment_not_configured 안내.
export function PayButton({ submissionId }: { submissionId: string }) {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	const onPay = async () => {
		setPending(true);
		const res = await payForSubmission(submissionId);
		setPending(false);

		if (res.ok) {
			toast.success("결제가 완료되었습니다");
			router.refresh();
			return;
		}
		if (res.error === "payment_not_configured") {
			toast.error("결제 수단이 아직 준비되지 않았습니다.");
			return;
		}
		toast.error("결제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
	};

	return (
		<Button onClick={onPay} disabled={pending}>
			{pending ? "처리 중…" : "결제하고 결과 보기"}
		</Button>
	);
}
