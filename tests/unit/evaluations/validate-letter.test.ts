import { describe, expect, it } from "vitest";
import { PROHIBITED, validateLetter } from "@/lib/evaluations/validate-letter";

describe("validateLetter", () => {
	const ok = "안녕하세요, 박지윤 학생 부모님. 좋은 평가였습니다. 김 코치 드림.";

	it("accepts valid letter", () => {
		expect(validateLetter(ok)).toEqual({ ok: true });
	});

	it("rejects when missing 안녕하세요", () => {
		const r = validateLetter("반갑습니다, 부모님.");
		expect(r).toEqual({ ok: false, error: "must_start_greeting" });
	});

	it("rejects when over 350 chars (excluding whitespace)", () => {
		const long = `안녕하세요${"가".repeat(400)}`;
		expect(validateLetter(long)).toEqual({ ok: false, error: "too_long" });
	});

	it("rejects each prohibited word", () => {
		for (const word of PROHIBITED) {
			const text = `안녕하세요 부모님. ${word} 평가.`;
			expect(validateLetter(text)).toEqual({
				ok: false,
				error: `prohibited:${word}`,
			});
		}
	});
});
