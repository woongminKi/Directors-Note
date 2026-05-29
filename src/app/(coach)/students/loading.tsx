import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the students list: title → filter tabs → student rows.
export default function StudentsLoading() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-28" />
				<Skeleton className="h-9 w-24 rounded-md" />
			</div>
			<div className="flex gap-2">
				{["t1", "t2", "t3"].map((k) => (
					<Skeleton key={k} className="h-7 w-20 rounded-md" />
				))}
			</div>
			<ul className="space-y-2">
				{["l1", "l2", "l3", "l4", "l5"].map((k) => (
					<Skeleton key={k} className="h-16 w-full rounded-lg" />
				))}
			</ul>
		</div>
	);
}
