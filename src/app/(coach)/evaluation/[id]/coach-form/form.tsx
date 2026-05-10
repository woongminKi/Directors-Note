"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DegradeBanner } from "@/components/degrade-banner";
import { KoreanCharCounter } from "@/components/korean-char-counter";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import {
	type CoachBulletFormInput,
	coachBulletFormSchema,
} from "@/lib/forms/coach-bullet-form";
import { submitCoachBulletEvaluation } from "./actions";

interface Props {
	evaluationId: string;
	studentId: string;
	studentName: string;
	year: string;
	defaultDate: string; // YYYY-MM-DD
	degradeReason?: "feature_off" | "ai_failed";
}

const FIELDS: Array<{
	key: keyof CoachBulletFormInput["bullets"];
	label: string;
	placeholder: string;
	max: number;
}> = [
	{
		key: "vocal",
		label: "발성",
		placeholder: "예: 호흡 안정, 후반부 떨림 / 작은 목소리, 끝맺음 흐림",
		max: 200,
	},
	{
		key: "diction",
		label: "발음",
		placeholder: "예: 받침 명확 / 빠른 발화 시 흐림",
		max: 200,
	},
	{
		key: "expression",
		label: "표정",
		placeholder: "예: 감정 빌드업 자연스러움 / 무표정, 단조로움",
		max: 200,
	},
	{
		key: "movement",
		label: "움직임",
		placeholder: "예: 시선·몸짓 일치 / 대사와 따로 움직임",
		max: 200,
	},
	{
		key: "examReadiness",
		label: "입시 완성도",
		placeholder: "예: 본방 70% / 대사 자기화 완료",
		max: 200,
	},
];

export function CoachBulletForm({
	evaluationId,
	studentId,
	studentName,
	year,
	defaultDate,
	degradeReason,
}: Props) {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);

	const form = useForm<CoachBulletFormInput>({
		resolver: zodResolver(coachBulletFormSchema),
		defaultValues: {
			studentId,
			year,
			evaluationDate: defaultDate,
			bullets: {
				vocal: "",
				diction: "",
				expression: "",
				movement: "",
				examReadiness: "",
				freeNote: "",
			},
		},
	});

	const onSubmit = async (input: CoachBulletFormInput) => {
		setSubmitting(true);
		try {
			const result = await submitCoachBulletEvaluation(evaluationId, input);
			if (result.ok) {
				toast.success("letter 초안이 작성되었습니다");
				router.push(result.redirectTo);
			} else {
				toast.error(errorMessage(result.error, result.details));
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "알 수 없는 오류");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-24">
				<div className="bg-card border rounded-lg p-4">
					<div className="text-sm text-muted-foreground mb-2">
						{defaultDate} · {year}
					</div>
					<div className="text-lg font-bold">{studentName} 학생 평가</div>
				</div>

				{degradeReason && <DegradeBanner reason={degradeReason} />}

				<div className="bg-blue-50 border-l-4 border-blue-500 px-4 py-3 text-sm text-blue-900 rounded-r">
					최소 2개 이상의 항목을 작성해 주세요. (자유 메모 제외)
				</div>

				{FIELDS.map((f) => (
					<FormField
						key={f.key}
						control={form.control}
						name={`bullets.${f.key}` as const}
						render={({ field }) => (
							<FormItem className="bg-card border rounded-lg p-4">
								<FormLabel className="flex items-center gap-1.5">
									<span className="text-blue-600">◇</span> {f.label}
									<span className="text-xs text-muted-foreground font-normal">
										(선택)
									</span>
								</FormLabel>
								<FormControl>
									<Textarea
										{...field}
										placeholder={f.placeholder}
										maxLength={f.max}
										className="min-h-[72px] bg-background"
									/>
								</FormControl>
								<KoreanCharCounter value={field.value ?? ""} max={f.max} />
								<FormMessage />
							</FormItem>
						)}
					/>
				))}

				<FormField
					control={form.control}
					name="bullets.freeNote"
					render={({ field }) => (
						<FormItem className="bg-card border rounded-lg p-4">
							<FormLabel className="flex items-center gap-1.5">
								<span className="text-blue-600">◇</span> 추가 코멘트
								<span className="text-xs text-muted-foreground font-normal">
									(선택)
								</span>
							</FormLabel>
							<FormControl>
								<Textarea
									{...field}
									placeholder="코치만의 추가 관찰, 학생 격려 메시지, 다음 달 계획 등"
									maxLength={300}
									className="min-h-[72px] bg-background"
								/>
							</FormControl>
							<KoreanCharCounter value={field.value ?? ""} max={300} />
						</FormItem>
					)}
				/>

				{form.formState.errors.bullets?.message && (
					<div className="text-sm text-destructive">
						{form.formState.errors.bullets.message}
					</div>
				)}

				<div className="fixed bottom-0 left-0 right-0 max-w-screen-sm mx-auto p-4 bg-background border-t z-20">
					<Button
						type="submit"
						disabled={submitting}
						className="w-full h-12 text-base"
					>
						{submitting ? "letter 작성 중..." : "AI letter 작성 시작"}
					</Button>
				</div>
			</form>
		</Form>
	);
}

function errorMessage(
	error: "validation" | "no_consent" | "not_found" | "duplicate" | "llm_failed",
	details?: string,
): string {
	switch (error) {
		case "validation":
			return details ?? "입력값을 다시 확인해 주세요.";
		case "no_consent":
			return "이 학생의 부모 동의가 등록되지 않았습니다. 학원 관리자에게 문의해 주세요.";
		case "not_found":
			return "평가 정보를 찾을 수 없습니다.";
		case "duplicate":
			return "오늘 날짜로 이미 평가가 진행 중입니다.";
		case "llm_failed":
			return "letter 작성에 실패했습니다. 다시 시도해 주세요.";
	}
}
