interface Props {
	totalStudents: number;
	thisMonthCompleted: number;
	cycleDeadline: string; // ISO YYYY-MM-DD
}

function daysUntil(iso: string): number {
	const target = new Date(`${iso}T00:00:00`).getTime();
	const now = Date.now();
	const ms = target - now;
	return Math.ceil(ms / (1000 * 60 * 60 * 24));
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
