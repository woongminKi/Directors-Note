import { describe, expect, it } from "vitest";
import { studentFormSchema } from "@/lib/students/schema";

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

	it("rejects year longer than 20", () => {
		const r = studentFormSchema.safeParse({
			name: "박지윤",
			year: "x".repeat(21),
			parentConsentOnFile: false,
		});
		expect(r.success).toBe(false);
	});

	it("parentConsentOnFile defaults to false", () => {
		const r = studentFormSchema.safeParse({ name: "박지윤" });
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.parentConsentOnFile).toBe(false);
	});
});
