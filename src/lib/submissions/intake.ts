// WS3 소비자 인테이크 — 순수 로직 (DB 비의존, Vitest 단위 테스트 대상).
// 동의 게이트 술어(WS3.3) + age_band/is_minor 파생.

export type AgeBand = "under14" | "14_18" | "adult";

// TODO(lawyer): 한국 PIPA 아동 동의 임계가 미결(BLOCKING #1). 아래 임계는 placeholder.
// 통상 만 14세 미만이 법정대리인 동의 대상으로 거론되나, 본 서비스 문맥(연기입시
// 영상·민감정보)에서의 정확한 임계·보호자 검증 강도는 변호사 사인오프 전 확정 불가.
// 임계가 바뀌면 이 상수만 갱신하면 됨 — 파생 로직은 임계 파라미터에 의존.
export const MINOR_AGE_THRESHOLD = 18 as const; // 미성년 판정 상한 (이 나이 미만 = 미성년)
export const CHILD_CONSENT_AGE_THRESHOLD = 14 as const; // under14 밴드 경계

// 나이(만) → age_band 파생. 임계는 위 상수(변호사 사인오프 대기).
export function deriveAgeBand(age: number): AgeBand {
	if (age < CHILD_CONSENT_AGE_THRESHOLD) return "under14";
	if (age < MINOR_AGE_THRESHOLD) return "14_18";
	return "adult";
}

// age_band → is_minor 파생. adult 만 성인, 나머지는 미성년.
export function isMinorFromBand(band: AgeBand): boolean {
	return band !== "adult";
}

// 나이 → is_minor 직접 파생(밴드 경유와 일관).
export function isMinorFromAge(age: number): boolean {
	return age < MINOR_AGE_THRESHOLD;
}

// enqueue 게이트(WS3.3)의 순수 술어. 통과해야만 status='queued' 가능.
// 거부 조건: 동의 미기록 / (미성년인데 보호자 연락처 없음) / 영상 미첨부.
// coach-form/actions.ts 의 no_consent 게이트를 일반화.
export type EnqueueGateInput = {
	consentRecordedAt: Date | null;
	isMinor: boolean;
	guardianContact: string | null;
	videoStorageUrl: string | null;
};

export type EnqueueGateResult =
	| { ok: true }
	| { ok: false; reason: "no_consent" | "no_guardian" | "no_video" };

export function checkEnqueueGate(input: EnqueueGateInput): EnqueueGateResult {
	if (input.consentRecordedAt === null)
		return { ok: false, reason: "no_consent" };
	if (input.isMinor && !nonEmpty(input.guardianContact))
		return { ok: false, reason: "no_guardian" };
	if (!nonEmpty(input.videoStorageUrl))
		return { ok: false, reason: "no_video" };
	return { ok: true };
}

function nonEmpty(v: string | null): boolean {
	return typeof v === "string" && v.trim().length > 0;
}
