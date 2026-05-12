"use client";

import { useQuery } from "@tanstack/react-query";
import { CoachProgressBar } from "@/app/(coach)/dashboard/components/coach-progress-bar";
import { EscalationBadge } from "@/app/(coach)/dashboard/components/escalation-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	deriveEscalations,
	type EscalationAlert,
} from "@/lib/dashboard/escalation-rules";
import type { CoachProgress, EscalationData } from "@/lib/dashboard/queries";

interface Props {
	academyId: string;
	initialCoaches: CoachProgress[];
	initialEscalation: EscalationData;
	fetchCoaches: () => Promise<CoachProgress[]>;
	fetchEscalation: () => Promise<EscalationData>;
}

export function OwnerStatusRow({
	academyId,
	initialCoaches,
	initialEscalation,
	fetchCoaches,
	fetchEscalation,
}: Props) {
	const coaches = useQuery({
		queryKey: ["owner", "coach-progress", academyId],
		queryFn: fetchCoaches,
		refetchInterval: 60_000,
		initialData: initialCoaches,
		initialDataUpdatedAt: Date.now(),
	});

	const escalation = useQuery({
		queryKey: ["owner", "escalation", academyId],
		queryFn: fetchEscalation,
		refetchInterval: 60_000,
		initialData: initialEscalation,
		initialDataUpdatedAt: Date.now(),
	});

	const alerts: EscalationAlert[] = escalation.data
		? deriveEscalations(escalation.data)
		: [];

	const hasError = coaches.isError || escalation.isError;

	return (
		<section
			aria-label="학원 코치 진행률"
			className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3"
		>
			{coaches.isLoading && !coaches.data ? (
				<>
					<Skeleton className="h-12 w-32" />
					<Skeleton className="h-12 w-32" />
					<Skeleton className="h-12 w-32" />
				</>
			) : hasError ? (
				<p className="text-sm text-destructive">
					불러오기 실패. 새로고침 해주세요.
				</p>
			) : (
				coaches.data?.map((c) => (
					<CoachProgressBar
						key={c.userId}
						email={c.email}
						progressRatio={c.progressRatio}
					/>
				))
			)}
			<div className="ml-auto">
				<EscalationBadge alerts={alerts} />
			</div>
		</section>
	);
}
