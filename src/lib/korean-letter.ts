// 한국어 letter 검증 — prompt-template v2 의 규칙 enforcement.
// LLM 응답이 prompt 를 무시하는 경우를 catch.

const PROHIBITED_WORDS = [
	"분석",
	"AI",
	"인공지능",
	"자동",
	"측정",
	"데이터",
	"점수",
	"등급",
	"지표",
	"리포트",
	"보고서",
];

export type LetterValidationResult =
	| { ok: true; text: string }
	| { ok: false; reason: string };

/**
 * Letter 가 prompt-template v2 의 모든 규칙을 통과하는지 검증.
 * 규칙: 안녕하세요 시작 / 350자 hard cap / 금지어 0회.
 */
export function validateLetter(text: string): LetterValidationResult {
	const trimmed = text.trim();

	if (!trimmed.startsWith("안녕하세요")) {
		return { ok: false, reason: "letter must start with 안녕하세요" };
	}

	const charCount = countKoreanChars(trimmed);
	if (charCount > 350) {
		return {
			ok: false,
			reason: `letter exceeds 350 char hard cap (${charCount} chars)`,
		};
	}

	if (charCount < 50) {
		return {
			ok: false,
			reason: `letter too short (${charCount} chars)`,
		};
	}

	for (const word of PROHIBITED_WORDS) {
		if (trimmed.includes(word)) {
			return {
				ok: false,
				reason: `letter contains prohibited word: ${word}`,
			};
		}
	}

	return { ok: true, text: trimmed };
}

/**
 * 한국어 글자 수 — 공백/줄바꿈 제외 visible 글자만 카운트.
 */
export function countKoreanChars(text: string): number {
	return [...text].filter((c) => c.trim().length > 0).length;
}
