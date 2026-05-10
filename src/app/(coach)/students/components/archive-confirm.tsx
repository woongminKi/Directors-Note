"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { archiveStudent } from "@/lib/students/actions";

export function ArchiveConfirm({ studentId }: { studentId: string }) {
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const router = useRouter();

	const handleConfirm = () =>
		startTransition(async () => {
			const res = await archiveStudent(studentId);
			if (res.ok) router.push("/students?filter=archived");
		});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="destructive" className="w-full">
						보관 (archive)
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>학생을 보관하시겠습니까?</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					이 작업은 되돌릴 수 없습니다.
				</p>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						취소
					</Button>
					<Button
						variant="destructive"
						disabled={pending}
						onClick={handleConfirm}
					>
						보관
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
