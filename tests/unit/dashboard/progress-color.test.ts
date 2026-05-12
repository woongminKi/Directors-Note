import { describe, expect, it } from "vitest";
import { progressColorTier } from "@/lib/dashboard/progress-color";

describe("progressColorTier", () => {
	it("returns 'behind' below 30%", () => {
		expect(progressColorTier(0)).toBe("behind");
		expect(progressColorTier(0.29)).toBe("behind");
	});

	it("returns 'on-track' from 30% to 70%", () => {
		expect(progressColorTier(0.3)).toBe("on-track");
		expect(progressColorTier(0.5)).toBe("on-track");
		expect(progressColorTier(0.69)).toBe("on-track");
	});

	it("returns 'complete' from 70% upward", () => {
		expect(progressColorTier(0.7)).toBe("complete");
		expect(progressColorTier(0.99)).toBe("complete");
		expect(progressColorTier(1.0)).toBe("complete");
	});

	it("clamps below 0 and above 1", () => {
		expect(progressColorTier(-0.5)).toBe("behind");
		expect(progressColorTier(2.0)).toBe("complete");
	});
});
