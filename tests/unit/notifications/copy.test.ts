import { describe, expect, it } from "vitest";
import { buildNotificationContent } from "@/lib/notifications/copy";

describe("buildNotificationContent", () => {
	it("submission_released → 소비자 결과 공개, /submissions/[id]", () => {
		const c = buildNotificationContent("submission_released", "abc");
		expect(c.url).toBe("/submissions/abc");
		expect(c.title).toBe("결과가 준비됐어요");
	});

	it("evaluator_assigned → /score/[id], 마감 안내", () => {
		const c = buildNotificationContent("evaluator_assigned", "xyz");
		expect(c.url).toBe("/score/xyz");
		expect(c.title).toBe("새 채점 배정");
	});

	it("submission_scored → /submissions/[id]", () => {
		const c = buildNotificationContent("submission_scored", "s1");
		expect(c.url).toBe("/submissions/s1");
	});

	it("P2: 어떤 문구에도 점수/등급이 없다", () => {
		for (const type of [
			"submission_released",
			"evaluator_assigned",
			"submission_scored",
		] as const) {
			const c = buildNotificationContent(type, "id");
			// 점수/등급 노출 방지: A~D 단독 등급 토큰과 'N점' 패턴이 없어야 한다.
			// (마감 '48' 같은 숫자는 점수가 아니므로 'N점' 패턴만 금지.)
			expect(`${c.title} ${c.body}`).not.toMatch(/\b[A-D]\b|\d+\s*점/);
		}
	});
});
