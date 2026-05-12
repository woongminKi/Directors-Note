"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EscalationAlert } from "@/lib/dashboard/escalation-rules";

interface Props {
	alerts: EscalationAlert[];
}

export function EscalationBadge({ alerts }: Props) {
	if (alerts.length === 0) return null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="inline-flex items-center gap-1 rounded-md border bg-amber-50 px-2 py-1 text-sm hover:bg-amber-100"
				aria-label={`알림 ${alerts.length}건`}
			>
				<AlertTriangle className="h-4 w-4 text-amber-600" />
				<Badge variant="secondary">{alerts.length}</Badge>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuLabel>주의가 필요한 항목</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{alerts.map((a, i) => (
					<DropdownMenuItem
						key={a.kind === "regression" ? `r-${a.studentId}` : `f-${i}`}
						className="flex-col items-start gap-0.5"
					>
						<span className="text-xs uppercase text-muted-foreground">
							{a.kind === "regression" ? "등급 후퇴" : "AI 실패"}
						</span>
						<span className="text-sm">{a.label}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
