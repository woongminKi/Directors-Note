import { describe, expect, it } from "vitest";
import { generateRawToken, hashToken } from "@/lib/evaluations/share-link";

describe("share-link", () => {
	it("generateRawToken returns ≥40-char base64url", () => {
		const t = generateRawToken();
		expect(t.length).toBeGreaterThanOrEqual(40);
		expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it("generateRawToken returns different tokens each call", () => {
		expect(generateRawToken()).not.toBe(generateRawToken());
	});

	it("hashToken is deterministic given same pepper", () => {
		expect(hashToken("abc", "pepper")).toBe(hashToken("abc", "pepper"));
	});

	it("hashToken differs across pepper", () => {
		expect(hashToken("abc", "pepperA")).not.toBe(hashToken("abc", "pepperB"));
	});

	it("hashToken returns 64-char hex (sha256)", () => {
		expect(hashToken("abc", "p")).toMatch(/^[a-f0-9]{64}$/);
	});
});
