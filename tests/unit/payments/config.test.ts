import { describe, expect, it } from "vitest";
import { SUBMISSION_PRICE_KRW } from "@/lib/payments/config";

describe("payment config", () => {
	it("기본 가격은 9900원(정수)", () => {
		expect(SUBMISSION_PRICE_KRW).toBe(9900);
		expect(Number.isInteger(SUBMISSION_PRICE_KRW)).toBe(true);
	});
});
