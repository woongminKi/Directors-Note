import { describe, expect, it } from "vitest";
import {
	consentIntakeFormSchema,
	createSubmissionInputSchema,
} from "@/lib/forms/consent-intake-form";

describe("consentIntakeFormSchema", () => {
	it("accepts an adult with consent and no guardian", () => {
		const r = consentIntakeFormSchema.safeParse({
			ageBand: "adult",
			isMinor: false,
			consentAgreed: true,
			trainingOptIn: false,
		});
		expect(r.success).toBe(true);
	});

	it("accepts a minor with guardian relationship + contact", () => {
		const r = consentIntakeFormSchema.safeParse({
			ageBand: "14_18",
			isMinor: true,
			guardianRelationship: "모",
			guardianContact: "010-1234-5678",
			consentAgreed: true,
			trainingOptIn: true,
		});
		expect(r.success).toBe(true);
	});

	it("rejects a minor missing guardian relationship", () => {
		const r = consentIntakeFormSchema.safeParse({
			ageBand: "under14",
			isMinor: true,
			guardianContact: "010-1234-5678",
			consentAgreed: true,
		});
		expect(r.success).toBe(false);
		if (!r.success)
			expect(
				r.error.issues.some((i) => i.path.includes("guardianRelationship")),
			).toBe(true);
	});

	it("rejects a minor missing guardian contact", () => {
		const r = consentIntakeFormSchema.safeParse({
			ageBand: "under14",
			isMinor: true,
			guardianRelationship: "부",
			consentAgreed: true,
		});
		expect(r.success).toBe(false);
		if (!r.success)
			expect(
				r.error.issues.some((i) => i.path.includes("guardianContact")),
			).toBe(true);
	});

	it("rejects when consent not agreed", () => {
		const r = consentIntakeFormSchema.safeParse({
			ageBand: "adult",
			isMinor: false,
			consentAgreed: false,
			trainingOptIn: false,
		});
		expect(r.success).toBe(false);
	});

	it("rejects an invalid age band", () => {
		const r = consentIntakeFormSchema.safeParse({
			ageBand: "teen",
			isMinor: true,
			consentAgreed: true,
		});
		expect(r.success).toBe(false);
	});

	it("defaults trainingOptIn to false when omitted (opt-in absence = no consent)", () => {
		const r = consentIntakeFormSchema.safeParse({
			ageBand: "adult",
			isMinor: false,
			consentAgreed: true,
		});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.trainingOptIn).toBe(false);
	});
});

describe("createSubmissionInputSchema", () => {
	it("accepts a valid scene type", () => {
		const r = createSubmissionInputSchema.safeParse({ sceneType: "자유연기" });
		expect(r.success).toBe(true);
	});

	it("rejects an empty scene type", () => {
		const r = createSubmissionInputSchema.safeParse({ sceneType: "  " });
		expect(r.success).toBe(false);
	});

	it("accepts an optional performance year", () => {
		const r = createSubmissionInputSchema.safeParse({
			sceneType: "지정대사",
			performanceYear: "입시 1년차",
		});
		expect(r.success).toBe(true);
	});
});
