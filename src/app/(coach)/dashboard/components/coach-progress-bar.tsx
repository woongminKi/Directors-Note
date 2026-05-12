import { progressColorTier } from "@/lib/dashboard/progress-color";

interface Props {
	email: string;
	progressRatio: number;
}

const TIER_BG: Record<ReturnType<typeof progressColorTier>, string> = {
	behind: "bg-red-500",
	"on-track": "bg-amber-500",
	complete: "bg-emerald-500",
};

export function CoachProgressBar({ email, progressRatio }: Props) {
	const tier = progressColorTier(progressRatio);
	const pct = Math.round(Math.max(0, Math.min(1, progressRatio)) * 100);
	return (
		<div
			data-tier={tier}
			className="flex min-w-32 flex-col gap-1 rounded-md border bg-card p-2"
		>
			<div className="flex items-center justify-between text-xs">
				<span className="truncate text-muted-foreground">{email}</span>
				<span className="font-medium">{pct}%</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded bg-muted">
				<div
					className={`h-full ${TIER_BG[tier]} transition-all`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
