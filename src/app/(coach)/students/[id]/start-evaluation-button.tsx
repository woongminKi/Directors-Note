"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startEvaluation } from "@/lib/evaluations/start-action";

export function StartEvaluationButton({
	studentId,
	disabled,
}: {
	studentId: string;
	disabled: boolean;
}) {
	const [pending, startTransition] = useTransition();
	const router = useRouter();

	const handle = () =>
		startTransition(async () => {
			const res = await startEvaluation(studentId);
			if (!res.ok) {
				toast.error(
					res.error === "no_consent"
						? "부모 동의가 필요합니다"
						: "학생을 찾을 수 없습니다",
				);
				return;
			}
			router.push(res.redirectTo);
		});

	return (
		<Button className="w-full" disabled={disabled || pending} onClick={handle}>
			{disabled
				? "동의서 필요"
				: pending
					? "시작 중..."
					: "시작하기 (이번 달 평가)"}
		</Button>
	);
}
