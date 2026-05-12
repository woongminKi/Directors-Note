"use client";

import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/app/(coach)/dashboard/components/empty-state";
import { StudentRow } from "@/app/(coach)/dashboard/components/student-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { EmptyStateVariant } from "@/lib/dashboard/empty-state-config";

export type QueueRow = {
	id: string;
	studentName: string;
	year: string | null;
	href: string;
	metaLabel?: string;
};

interface Props {
	title: string;
	queryKey: readonly unknown[];
	fetcher: () => Promise<QueueRow[]>;
	emptyVariant: EmptyStateVariant;
	pollIntervalMs: number;
	initialData?: QueueRow[];
}

export function QueueCard({
	title,
	queryKey,
	fetcher,
	emptyVariant,
	pollIntervalMs,
	initialData,
}: Props) {
	const { data, isLoading, isError } = useQuery({
		queryKey,
		queryFn: fetcher,
		refetchInterval: pollIntervalMs,
		initialData,
		// Server Component just fetched this — mark fresh so React Query
		// respects staleTime instead of refetching immediately on mount.
		initialDataUpdatedAt: initialData ? Date.now() : undefined,
	});

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">
					{title}
					{data && (
						<span className="ml-2 text-sm text-muted-foreground">
							({data.length})
						</span>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{isLoading && !data ? (
					<div className="space-y-2 p-3">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
					</div>
				) : isError ? (
					<p className="px-6 py-10 text-center text-sm text-destructive">
						불러오기 실패. 새로고침 해주세요.
					</p>
				) : !data || data.length === 0 ? (
					<EmptyState variant={emptyVariant} />
				) : (
					<div className="divide-y">
						{data.map((row) => (
							<StudentRow
								key={row.id}
								studentName={row.studentName}
								year={row.year}
								href={row.href}
								metaLabel={row.metaLabel}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
