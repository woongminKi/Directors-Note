import { Skeleton } from "@/components/ui/skeleton";

// Generic fallback for any coach-group route without its own loading.tsx.
// Renders inside the coach layout's <main>, so nav stays put and only the
// content area shows a shimmer while the server segment streams in.
export default function Loading() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-7 w-48" />
			<div className="grid gap-4 sm:grid-cols-2">
				{["a", "b", "c", "d"].map((k) => (
					<Skeleton key={k} className="h-28 w-full rounded-lg" />
				))}
			</div>
		</div>
	);
}
