import { describe, expect, it } from "vitest";
import { emptyStateConfig } from "@/lib/dashboard/empty-state-config";

describe("emptyStateConfig", () => {
	it("returns sparkle message for eval-todo empty (no CTA)", () => {
		const cfg = emptyStateConfig("eval-todo");
		expect(cfg.message).toContain("이번 cycle");
		expect(cfg.message).toContain("✨");
		expect(cfg.cta).toBeUndefined();
	});

	it("returns CTA for review-pending empty", () => {
		const cfg = emptyStateConfig("review-pending");
		expect(cfg.cta?.label).toBe("새 평가 시작");
		expect(cfg.cta?.href).toBe("/students");
	});

	it("returns no-CTA message for sent empty", () => {
		const cfg = emptyStateConfig("sent");
		expect(cfg.message).toContain("첫 발송");
		expect(cfg.cta).toBeUndefined();
	});

	it("returns coach-invite CTA for owner-no-coach", () => {
		const cfg = emptyStateConfig("owner-no-coach");
		expect(cfg.cta?.label).toBe("코치 초대");
		expect(cfg.cta?.href).toBe("/users/new");
	});
});
