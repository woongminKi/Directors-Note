export const PROHIBITED = [
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
] as const;

export type LetterValidationResult =
	| { ok: true }
	| {
			ok: false;
			error: "must_start_greeting" | "too_long" | `prohibited:${string}`;
	  };

export function validateLetter(text: string): LetterValidationResult {
	const trimmed = text.trim();
	if (!trimmed.startsWith("안녕하세요"))
		return { ok: false, error: "must_start_greeting" };

	const charCount = [...trimmed].filter((c) => c.trim().length > 0).length;
	if (charCount > 350) return { ok: false, error: "too_long" };

	for (const word of PROHIBITED) {
		if (trimmed.includes(word))
			return { ok: false, error: `prohibited:${word}` };
	}

	return { ok: true };
}
