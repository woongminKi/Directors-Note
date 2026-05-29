"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteReferenceVideo } from "@/lib/reference/actions";

export function DeleteReferenceButton({ id }: { id: string }) {
	const [confirming, setConfirming] = useState(false);
	const [pending, startTransition] = useTransition();

	if (!confirming) {
		return (
			<Button
				variant="ghost"
				size="sm"
				className="text-destructive"
				onClick={() => setConfirming(true)}
			>
				삭제
			</Button>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<Button
				variant="destructive"
				size="sm"
				disabled={pending}
				onClick={() =>
					startTransition(async () => {
						const res = await deleteReferenceVideo(id);
						if (!res.ok) toast.error("삭제 실패");
					})
				}
			>
				{pending ? "삭제 중…" : "정말 삭제"}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={pending}
				onClick={() => setConfirming(false)}
			>
				취소
			</Button>
		</div>
	);
}
