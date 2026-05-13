import { describe, expect, it } from "vitest";
import { kstMonthFirst, kstMonthLastDay, kstToday } from "@/lib/datetime";

describe("kstToday", () => {
	it("returns KST date when UTC is on previous day", () => {
		// 2026-05-13 18:00 UTC = 2026-05-14 03:00 KST
		expect(kstToday(new Date("2026-05-13T18:00:00Z"))).toBe("2026-05-14");
	});

	it("returns KST date when UTC is on next day", () => {
		// 2026-05-13 14:30 UTC = 2026-05-13 23:30 KST
		expect(kstToday(new Date("2026-05-13T14:30:00Z"))).toBe("2026-05-13");
	});

	it("returns KST date at KST midnight boundary", () => {
		// 2026-05-13 15:00 UTC = 2026-05-14 00:00 KST
		expect(kstToday(new Date("2026-05-13T15:00:00Z"))).toBe("2026-05-14");
	});

	it("uses Intl-formatted YYYY-MM-DD shape", () => {
		expect(kstToday(new Date("2026-01-01T00:00:00Z"))).toMatch(
			/^\d{4}-\d{2}-\d{2}$/,
		);
	});
});

describe("kstMonthFirst", () => {
	it("returns first day of current KST month in mid-month", () => {
		expect(kstMonthFirst(new Date("2026-05-13T12:00:00Z"))).toBe("2026-05-01");
	});

	it("returns next-month first when UTC is on previous month's last day late-night", () => {
		// 2026-04-30 17:00 UTC = 2026-05-01 02:00 KST → KST month is May
		expect(kstMonthFirst(new Date("2026-04-30T17:00:00Z"))).toBe("2026-05-01");
	});

	it("returns same-month first when UTC slightly behind KST midnight", () => {
		// 2026-04-30 14:30 UTC = 2026-04-30 23:30 KST → KST month is still April
		expect(kstMonthFirst(new Date("2026-04-30T14:30:00Z"))).toBe("2026-04-01");
	});

	it("returns January 1 at year boundary", () => {
		// 2026-12-31 17:00 UTC = 2027-01-01 02:00 KST → January
		expect(kstMonthFirst(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
	});
});

describe("kstMonthLastDay", () => {
	it("returns last day of current KST month in mid-month", () => {
		expect(kstMonthLastDay(new Date("2026-05-13T12:00:00Z"))).toBe(
			"2026-05-31",
		);
	});

	it("returns last day of KST May even on UTC April-30 late-night", () => {
		// 2026-04-30 17:00 UTC = 2026-05-01 02:00 KST → May (last day 2026-05-31)
		expect(kstMonthLastDay(new Date("2026-04-30T17:00:00Z"))).toBe(
			"2026-05-31",
		);
	});

	it("returns Feb 28 in non-leap year", () => {
		expect(kstMonthLastDay(new Date("2026-02-15T12:00:00Z"))).toBe(
			"2026-02-28",
		);
	});

	it("returns Feb 29 in leap year", () => {
		expect(kstMonthLastDay(new Date("2028-02-15T12:00:00Z"))).toBe(
			"2028-02-29",
		);
	});
});
