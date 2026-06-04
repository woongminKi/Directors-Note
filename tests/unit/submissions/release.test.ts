import { describe, expect, it } from "vitest";
import {
	checkReleaseGate,
	resolvePaymentMode,
} from "@/lib/submissions/release";

describe("checkReleaseGate", () => {
	const paid = new Date("2026-06-04T00:00:00Z");

	it("allows release when scored AND paid", () => {
		const r = checkReleaseGate({ status: "scored", paidAt: paid });
		expect(r).toEqual({ allowed: true, alreadyReleased: false });
	});

	it("blocks when scored but not paid", () => {
		const r = checkReleaseGate({ status: "scored", paidAt: null });
		expect(r).toEqual({ allowed: false, reason: "not_paid" });
	});

	it("blocks when paid but not yet scored (queued)", () => {
		const r = checkReleaseGate({ status: "queued", paidAt: paid });
		expect(r).toEqual({ allowed: false, reason: "not_scored" });
	});

	it("blocks when paid but only assigned", () => {
		const r = checkReleaseGate({ status: "assigned", paidAt: paid });
		expect(r).toEqual({ allowed: false, reason: "not_scored" });
	});

	it("blocks when neither scored nor paid", () => {
		const r = checkReleaseGate({ status: "queued", paidAt: null });
		expect(r).toEqual({ allowed: false, reason: "not_scored" });
	});

	it("is idempotent: already released → allowed no-op (even if paidAt somehow null)", () => {
		expect(checkReleaseGate({ status: "released", paidAt: paid })).toEqual({
			allowed: true,
			alreadyReleased: true,
		});
		expect(checkReleaseGate({ status: "released", paidAt: null })).toEqual({
			allowed: true,
			alreadyReleased: true,
		});
	});
});

describe("resolvePaymentMode", () => {
	it("returns stub when FEATURE_PAYMENT_ENABLED='false'", () => {
		expect(resolvePaymentMode("false")).toBe("stub");
	});

	it("returns payment_not_configured when FEATURE_PAYMENT_ENABLED='true'", () => {
		expect(resolvePaymentMode("true")).toBe("payment_not_configured");
	});

	it("defaults to stub for any non-'true' value", () => {
		expect(resolvePaymentMode("")).toBe("stub");
		expect(resolvePaymentMode("anything")).toBe("stub");
	});
});
