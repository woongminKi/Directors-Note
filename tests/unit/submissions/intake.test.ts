import { describe, expect, it } from "vitest";
import {
	checkEnqueueGate,
	deriveAgeBand,
	isMinorFromAge,
	isMinorFromBand,
} from "@/lib/submissions/intake";

describe("deriveAgeBand", () => {
	it("under14 below child threshold", () => {
		expect(deriveAgeBand(13)).toBe("under14");
		expect(deriveAgeBand(0)).toBe("under14");
	});
	it("14_18 between thresholds", () => {
		expect(deriveAgeBand(14)).toBe("14_18");
		expect(deriveAgeBand(17)).toBe("14_18");
	});
	it("adult at/above minor threshold", () => {
		expect(deriveAgeBand(18)).toBe("adult");
		expect(deriveAgeBand(40)).toBe("adult");
	});
});

describe("isMinorFromBand", () => {
	it("under14 and 14_18 are minors", () => {
		expect(isMinorFromBand("under14")).toBe(true);
		expect(isMinorFromBand("14_18")).toBe(true);
	});
	it("adult is not a minor", () => {
		expect(isMinorFromBand("adult")).toBe(false);
	});
});

describe("isMinorFromAge", () => {
	it("matches band derivation at boundary", () => {
		expect(isMinorFromAge(17)).toBe(true);
		expect(isMinorFromAge(18)).toBe(false);
	});
});

describe("checkEnqueueGate", () => {
	const consent = new Date();

	it("passes when adult has consent + video", () => {
		expect(
			checkEnqueueGate({
				consentRecordedAt: consent,
				isMinor: false,
				guardianContact: null,
				videoStorageUrl: "uid/sub.mp4",
			}),
		).toEqual({ ok: true });
	});

	it("passes when minor has consent + guardian + video", () => {
		expect(
			checkEnqueueGate({
				consentRecordedAt: consent,
				isMinor: true,
				guardianContact: "010-1234-5678",
				videoStorageUrl: "uid/sub.mp4",
			}),
		).toEqual({ ok: true });
	});

	it("refuses when consent missing", () => {
		expect(
			checkEnqueueGate({
				consentRecordedAt: null,
				isMinor: false,
				guardianContact: null,
				videoStorageUrl: "uid/sub.mp4",
			}),
		).toEqual({ ok: false, reason: "no_consent" });
	});

	it("refuses when minor has no guardian contact", () => {
		expect(
			checkEnqueueGate({
				consentRecordedAt: consent,
				isMinor: true,
				guardianContact: null,
				videoStorageUrl: "uid/sub.mp4",
			}),
		).toEqual({ ok: false, reason: "no_guardian" });
	});

	it("treats empty/whitespace guardian contact as missing for minors", () => {
		expect(
			checkEnqueueGate({
				consentRecordedAt: consent,
				isMinor: true,
				guardianContact: "   ",
				videoStorageUrl: "uid/sub.mp4",
			}),
		).toEqual({ ok: false, reason: "no_guardian" });
	});

	it("does not require guardian contact for adults", () => {
		expect(
			checkEnqueueGate({
				consentRecordedAt: consent,
				isMinor: false,
				guardianContact: null,
				videoStorageUrl: "uid/sub.mp4",
			}),
		).toEqual({ ok: true });
	});

	it("refuses when video missing", () => {
		expect(
			checkEnqueueGate({
				consentRecordedAt: consent,
				isMinor: false,
				guardianContact: null,
				videoStorageUrl: null,
			}),
		).toEqual({ ok: false, reason: "no_video" });
	});

	it("consent gate takes precedence over video gate", () => {
		expect(
			checkEnqueueGate({
				consentRecordedAt: null,
				isMinor: false,
				guardianContact: null,
				videoStorageUrl: null,
			}),
		).toEqual({ ok: false, reason: "no_consent" });
	});
});
