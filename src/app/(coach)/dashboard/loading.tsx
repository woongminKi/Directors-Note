import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the dashboard layout: greeting → mini stats → queue cards → recent.
export default function DashboardLoading() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-64" />

			<div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
				{["s1", "s2", "s3", "s4"].map((k) => (
					<Skeleton key={k} className="h-20 w-full rounded-lg" />
				))}
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				{["q1", "q2"].map((k) => (
					<div key={k} className="bg-card border rounded-lg p-4 space-y-3">
						<Skeleton className="h-5 w-32" />
						{["r1", "r2", "r3"].map((r) => (
							<Skeleton key={r} className="h-12 w-full" />
						))}
					</div>
				))}
			</div>

			<div className="bg-card border rounded-lg p-4 space-y-3">
				<Skeleton className="h-5 w-28" />
				{["a1", "a2"].map((r) => (
					<Skeleton key={r} className="h-10 w-full" />
				))}
			</div>
		</div>
	);
}
