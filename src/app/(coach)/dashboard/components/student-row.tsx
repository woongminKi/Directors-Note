import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface Props {
	studentName: string;
	year: string | null;
	href: string;
	metaLabel?: string;
}

export function StudentRow({ studentName, year, href, metaLabel }: Props) {
	return (
		<Link
			href={href}
			className="flex items-center justify-between gap-2 rounded px-3 py-2 text-sm hover:bg-accent"
		>
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate font-medium">{studentName}</span>
				{year && <span className="text-xs text-muted-foreground">{year}</span>}
			</div>
			{metaLabel && (
				<Badge variant="secondary" className="ml-auto">
					{metaLabel}
				</Badge>
			)}
		</Link>
	);
}
