import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
	type EmptyStateVariant,
	emptyStateConfig,
} from "@/lib/dashboard/empty-state-config";

interface Props {
	variant: EmptyStateVariant;
}

export function EmptyState({ variant }: Props) {
	const cfg = emptyStateConfig(variant);
	return (
		<div className="px-6 py-10 text-center">
			<p className="text-sm text-muted-foreground">{cfg.message}</p>
			{cfg.cta && (
				<Link
					href={cfg.cta.href}
					className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}
				>
					{cfg.cta.label}
				</Link>
			)}
		</div>
	);
}
