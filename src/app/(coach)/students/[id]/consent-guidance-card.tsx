"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { recordParentConsent } from "@/lib/students/actions";

export function ConsentGuidanceCard({
	studentId,
	canRecordConsent,
}: {
	studentId: string;
	canRecordConsent: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const router = useRouter();

	const handleConfirm = () =>
		startTransition(async () => {
			const res = await recordParentConsent(studentId);
			if (res.ok) {
				setOpen(false);
				toast.success("부모 동의가 기록되었습니다");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});

	return (
		<Alert className="mb-3 border-amber-300 bg-amber-50 text-amber-900">
			<AlertTitle className="text-amber-900">
				다음 할 일 — 부모 동의서
			</AlertTitle>
			<AlertDescription className="mt-0.5 mb-2 text-amber-800">
				아직 동의서가 기록되지 않았어요. 부모 동의를 받은 뒤 표시하세요.
			</AlertDescription>
			<div className="flex items-center gap-3">
				<Link
					href="/parent-consent"
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs text-primary underline"
				>
					동의서 전문 보기
				</Link>
				{canRecordConsent && (
					<Dialog open={open} onOpenChange={setOpen}>
						<DialogTrigger
							render={
								<Button size="sm" className="ml-auto">
									동의 받음으로 표시
								</Button>
							}
						/>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>부모 동의를 받으셨나요?</DialogTitle>
							</DialogHeader>
							<DialogDescription>
								확인 시 동의 완료로 기록되며, 이번 달 평가를 시작할 수 있습니다.
							</DialogDescription>
							<DialogFooter>
								<Button
									variant="ghost"
									disabled={pending}
									onClick={() => setOpen(false)}
								>
									취소
								</Button>
								<Button disabled={pending} onClick={handleConfirm}>
									확인
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				)}
			</div>
		</Alert>
	);
}
