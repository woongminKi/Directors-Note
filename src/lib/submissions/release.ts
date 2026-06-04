// WS6 — release-gate 순수 술어 + WS7 결제 분기 순수 로직.
//
// 부수효과 없는 함수만 둔다 (Vitest 단위 테스트 대상). 실제 DB 쓰기는
// release-action.ts / payment-action.ts 가 이 술어를 호출해 게이트한다.

// release 게이트: 소비자에게 사람 점수를 공개하려면
//   (1) primary 채점이 끝나 status='scored' 이고,
//   (2) 결제가 완료(paid_at IS NOT NULL)
// 둘 다 충족해야 한다. 이미 'released' 면 멱등 no-op 으로 허용한다.
export type ReleaseGateInput = {
	status: "queued" | "assigned" | "scored" | "released";
	paidAt: Date | null;
};

export type ReleaseGateResult =
	| { allowed: true; alreadyReleased: boolean }
	| { allowed: false; reason: "not_scored" | "not_paid" };

export function checkReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
	// 이미 공개됨 → 멱등 허용(no-op).
	if (input.status === "released") {
		return { allowed: true, alreadyReleased: true };
	}
	if (input.status !== "scored") {
		return { allowed: false, reason: "not_scored" };
	}
	if (input.paidAt === null) {
		return { allowed: false, reason: "not_paid" };
	}
	return { allowed: true, alreadyReleased: false };
}

// WS7 결제 분기(순수). FEATURE_PAYMENT_ENABLED 값으로 stub/real 갈래를 결정.
//   'false' → stub: paid_at 즉시 스탬프(무료 파일럿).
//   'true'  → real: 한국 PG webhook 경로(Phase A 미구현) → payment_not_configured.
export type PaymentMode = "stub" | "payment_not_configured";

export function resolvePaymentMode(featurePaymentEnabled: string): PaymentMode {
	return featurePaymentEnabled === "true" ? "payment_not_configured" : "stub";
}
