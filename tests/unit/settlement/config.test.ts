import { describe, expect, it } from "vitest";
import { EVALUATOR_FEE_KRW } from "@/lib/settlement/config";

describe("settlement config", () => {
	it("평가자 적립 단가는 6000원(정수)", () => {
		expect(EVALUATOR_FEE_KRW).toBe(6000);
		expect(Number.isInteger(EVALUATOR_FEE_KRW)).toBe(true);
	});
});
