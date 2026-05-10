"use client";
import { Button } from "@/components/ui/button";

export function StartEvaluationButton({
	disabled,
}: {
	studentId: string;
	disabled: boolean;
}) {
	return (
		<Button className="w-full" disabled={disabled}>
			{disabled ? "동의서 필요" : "시작하기 (이번 달 평가)"}
		</Button>
	);
}
