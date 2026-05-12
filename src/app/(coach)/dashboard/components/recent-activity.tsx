"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SentItem } from "@/lib/dashboard/queries";

interface Props {
	queryKey: readonly unknown[];
	fetcher: () => Promise<SentItem[]>;
	initialData?: SentItem[];
}

// Next.js serializes Date → ISO string when passing Server Component props
// or server-action results to Client Components, so polled `sentAt` values
// arrive as strings even though queries.ts types them as Date.
// `new Date(...)` accepts both shapes, so the runtime is correct either way.
function relativeTime(d: Date | string): string {
	const diff = Date.now() - new Date(d).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${minutes}분 전`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}시간 전`;
	const days = Math.floor(hours / 24);
	return `${days}일 전`;
}

export function RecentActivity({ queryKey, fetcher, initialData }: Props) {
	const { data, isLoading, isError } = useQuery({
		queryKey,
		queryFn: fetcher,
		refetchInterval: 60_000,
		initialData,
		initialDataUpdatedAt: initialData ? Date.now() : undefined,
	});

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">최근 활동</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{isLoading && !data ? (
					<div className="space-y-2 p-3">
						<Skeleton className="h-6 w-full" />
						<Skeleton className="h-6 w-full" />
					</div>
				) : isError ? (
					<p className="px-6 py-6 text-center text-sm text-destructive">
						불러오기 실패. 새로고침 해주세요.
					</p>
				) : !data || data.length === 0 ? (
					<p className="px-6 py-6 text-center text-sm text-muted-foreground">
						아직 활동이 없습니다.
					</p>
				) : (
					<ul className="divide-y">
						{data.slice(0, 8).map((item) => (
							<li
								key={item.feedbackDraftId}
								className="flex items-center justify-between px-3 py-2 text-sm"
							>
								<span className="truncate">
									<span className="font-medium">{item.studentName}</span>
									{item.year && (
										<span className="ml-1 text-xs text-muted-foreground">
											{item.year}
										</span>
									)}
									<span className="ml-2 text-muted-foreground">발송됨</span>
								</span>
								<span className="text-xs text-muted-foreground">
									{relativeTime(item.sentAt)}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
