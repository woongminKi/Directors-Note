const KST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Seoul",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

const KST_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Seoul",
	year: "numeric",
	month: "2-digit",
});

export function kstToday(now: Date = new Date()): string {
	return KST_FORMATTER.format(now);
}

export function kstMonthLastDay(now: Date = new Date()): string {
	const parts = KST_PARTS_FORMATTER.formatToParts(now);
	const year = Number(parts.find((p) => p.type === "year")?.value);
	const month = Number(parts.find((p) => p.type === "month")?.value);
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}
