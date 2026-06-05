import { env } from "@/lib/env";
import { KakaoPayProvider } from "@/lib/payments/kakaopay-provider";
import { StubPaymentProvider } from "@/lib/payments/stub-provider";
import type { PaymentProvider } from "@/lib/payments/types";

// 실결제(카카오페이) 활성 조건: 플래그 on + secret key 존재.
export function isKakaoPayEnabled(): boolean {
	return (
		env.FEATURE_PAYMENT_ENABLED === "true" && Boolean(env.KAKAO_PAY_SECRET_KEY)
	);
}

export function createPaymentProvider(): PaymentProvider {
	return isKakaoPayEnabled()
		? new KakaoPayProvider()
		: new StubPaymentProvider();
}
