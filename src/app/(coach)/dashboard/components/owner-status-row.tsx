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
	});

	const escalation = useQuery({
		queryKey: ["owner", "escalation", academyId],
		queryFn: fetchEscalation,
		refetchInterval: 60_000,
		initialData: initialEscalation,
	});

	const alerts: EscalationAlert[] = escalation.data
		? deriveEscalations(escalation.data)
		: [];

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
