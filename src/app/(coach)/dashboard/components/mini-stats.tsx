import { kstToday } from "@/lib/datetime";

interface Props {
	totalStudents: number;
	thisMonthCompleted: number;
	cycleDeadline: string; // ISO YYYY-MM-DD, KST calendar date
}

// Calendar-day diff (KST). Both inputs are treated as midnight UTC purely as
// a reference point — the diff is invariant under that choice. Avoids the
// `new Date('YYYY-MM-DD')` server-vs-client timezone trap.
function daysUntil(iso: string): number {
	const today = new Date(`${kstToday()}T00:00:00Z`).getTime();
	const target = new Date(`${iso}T00:00:00Z`).getTime();
	return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export function MiniStats({
	totalStudents,
	thisMonthCompleted,
	cycleDeadline,
}: Props) {
	const dday = daysUntil(cycleDeadline);
	const pct =
		totalStudents > 0
			? Math.round((thisMonthCompleted / totalStudents) * 100)
			: 0;
	return (
		<div className="grid grid-cols-3 gap-3 text-sm">
			<div className="rounded-md border bg-card p-3">
				<p className="text-xs text-muted-foreground">학생 수</p>
				<p className="text-lg font-semibold">{totalStudents}</p>
			</div>
			<div className="rounded-md border bg-card p-3">
				<p className="text-xs text-muted-foreground">이번 달 진행률</p>
				<p className="text-lg font-semibold">
					{pct}%{" "}
					<span className="text-xs text-muted-foreground">
						({thisMonthCompleted}/{totalStudents})
					</span>
				</p>
			</div>
			<div className="rounded-md border bg-card p-3">
				<p className="text-xs text-muted-foreground">마감</p>
				<p className="text-lg font-semibold">
					{dday >= 0 ? `D-${dday}` : `D+${-dday}`}
				</p>
			</div>
		</div>
	);
}
