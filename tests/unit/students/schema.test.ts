import { describe, expect, it } from "vitest";
import { normalizeYear, studentFormSchema } from "@/lib/students/schema";

describe("studentFormSchema", () => {
	it("accepts valid input", () => {
		const r = studentFormSchema.safeParse({
			name: "박지윤",
			year: "2년차",
			parentConsentOnFile: true,
		});
		expect(r.success).toBe(true);
	});

	it("rejects empty name", () => {
		const r = studentFormSchema.safeParse({
			name: "",
			year: "2년차",
			parentConsentOnFile: false,
		});
		expect(r.success).toBe(false);
	});

	it("rejects name longer than 40", () => {
		const r = studentFormSchema.safeParse({
			name: "가".repeat(41),
			year: "2년차",
			parentConsentOnFile: false,
		});
		expect(r.success).toBe(false);
	});

	it("year is optional", () => {
		const r = studentFormSchema.safeParse({
			name: "박지윤",
			parentConsentOnFile: false,
		});
		expect(r.success).toBe(true);
	});

	it("accepts empty year string (form default '' bug)", () => {
		// Controlled <Input> can't default to undefined → form submits "".
		// Previously `.min(1).optional()` rejected this with zod's English
		// default. Schema now allows "" at parse time; actions.ts normalizes
		// to null before insert.
		const r = studentFormSchema.safeParse({
			name: "박지윤",
			year: "",
			parentConsentOnFile: false,
		});
		expect(r.success).toBe(true);
	});

	it("rejects year longer than 20 with Korean message", () => {
		const r = studentFormSchema.safeParse({
			name: "박지윤",
			year: "x".repeat(21),
			parentConsentOnFile: false,
		});
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(r.error.issues[0]?.message).toContain("구분");
		}
	});

	it("parentConsentOnFile defaults to false", () => {
		const r = studentFormSchema.safeParse({ name: "박지윤" });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.parentConsentOnFile).toBe(false);
	});
});

describe("normalizeYear", () => {
	it("undefined → null", () => {
		expect(normalizeYear(undefined)).toBeNull();
	});
	it("empty string → null", () => {
		expect(normalizeYear("")).toBeNull();
	});
	it("whitespace-only → null", () => {
		expect(normalizeYear("   ")).toBeNull();
	});
	it("trims surrounding whitespace", () => {
		expect(normalizeYear("  2년차  ")).toBe("2년차");
	});
	it("passes valid value through", () => {
		expect(normalizeYear("재수생")).toBe("재수생");
	});
});
