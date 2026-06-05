"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { payReady } from "@/lib/payments/actions";

// 결제하기 버튼. payReady 가 반환한 redirectUrl 로 이동:
//  - 카카오페이: 결제창 URL → 승인 후 콜백이 결과 공개
//  - stub(무료 파일럿): 이미 승인·release 된 결과 페이지 URL
export function PayButton({ submissionId }: { submissionId: string }) {
	const [pending, setPending] = useState(false);

	const onPay = async () => {
		setPending(true);
		const res = await payReady(submissionId);
		if (res.ok) {
			window.location.href = res.redirectUrl;
			return;
		}
		setPending(false);
		toast.error("결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
	};

	return (
		<Button onClick={onPay} disabled={pending}>
			{pending ? "처리 중…" : "결제하고 결과 보기"}
		</Button>
	);
}
