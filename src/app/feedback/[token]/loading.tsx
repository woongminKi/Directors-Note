import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the parent report card while the token is validated + feedback loads.
export default function FeedbackLoading() {
	return (
		<main className="min-h-screen bg-muted/30 px-4 py-8">
			<div className="max-w-md mx-auto space-y-4">
				<Skeleton className="h-6 w-40 mx-auto" />
				<div className="rounded-lg bg-background p-4 shadow-sm space-y-2">
					<Skeleton className="h-3 w-12" />
					<Skeleton className="h-5 w-24" />
				</div>
				<div className="rounded-lg bg-background p-4 shadow-sm space-y-2">
					<Skeleton className="h-3 w-12" />
					<Skeleton className="h-5 w-32" />
				</div>
				<div className="rounded-lg bg-background p-4 shadow-sm space-y-2">
					<Skeleton className="h-3 w-16" />
					{["p1", "p2", "p3", "p4"].map((k) => (
						<Skeleton key={k} className="h-4 w-full" />
					))}
					<Skeleton className="h-4 w-2/3" />
				</div>
			</div>
		</main>
	);
}
