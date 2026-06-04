"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitEvaluatorScore } from "@/lib/assignment/score-action";
import {
	type EvaluatorScoreFormInput,
	evaluatorScoreFormSchema,
} from "@/lib/forms/evaluator-score-form";

interface Props {
	submissionId: string;
	videoUrl: string;
	sceneType: string;
	performanceYear: string | null;
	isRedundantLabel: boolean;
}

const RATIONALE_MAX = 300;

// judge-rubric-v1 의 4축. key 는 JUDGE_RESPONSE_SCHEMA / Zod 스키마와 정확히 일치.
const AXES: Array<{
	key: "vocal" | "expression" | "movement" | "examReadiness";
	label: string;
	hint: string;
	placeholder: string;
}> = [
	{
		key: "vocal",
		label: "발성",
		hint: "오디오(자유연기 대사 + 면접 응답). 발음·호흡·성량·전달력.",
		placeholder: "예: 발음 또렷, 호흡 안정. 후반부 성량 일부 흔들림.",
	},
	{
		key: "expression",
		label: "표정·정서",
		hint: "얼굴 미세표정 의존 금지. 신체·음성으로 드러나는 정서로 판단.",
		placeholder: "예: 감정 진정성 있으나 정서 전환이 다소 매끄럽지 못함.",
	},
	{
		key: "movement",
		label: "몸짓",
		hint: "최대 가시 신호(무용 + 전체 신체). 정렬·통제력·공간 활용·기술.",
		placeholder: "예: 정렬·균형 안정, 라인 분명. 일부 마무리 동작 불명확.",
	},
	{
		key: "examReadiness",
		label: "입시 완성도",
		hint: "무대 장악력·집중·일관성 + 면접 응답(논리·태도·자신감).",
		placeholder: "예: 시작–끝 집중 유지, 면접 응답 논리적. 본방 대비 80%.",
	},
];

const GRADES: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];

export function EvaluatorScoreForm({
	submissionId,
	videoUrl,
	sceneType,
	performanceYear,
	isRedundantLabel,
}: Props) {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);

	const form = useForm<EvaluatorScoreFormInput>({
		resolver: zodResolver(evaluatorScoreFormSchema),
		defaultValues: {
			rationale: {
				vocal: "",
				expression: "",
				movement: "",
				examReadiness: "",
			},
		},
	});

	const onSubmit = async (input: EvaluatorScoreFormInput) => {
		setSubmitting(true);
		try {
			const result = await submitEvaluatorScore(submissionId, input);
			if (result.ok) {
				toast.success(
					`채점이 제출되었습니다 (계산 등급 ${result.derivedGrade})`,
				);
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
				<div className="rounded-lg border bg-card p-4">
					<div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
						<span className="font-mono">#{submissionId.slice(0, 8)}</span>
						<span>·</span>
						<span>{sceneType}</span>
						{performanceYear && <span>· {performanceYear}</span>}
						{isRedundantLabel && (
							<span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
								QA 이중라벨
							</span>
						)}
					</div>
					{/* biome-ignore lint/a11y/useMediaCaption: 지원자 실기 영상은 자막 트랙이 없음 */}
					<video
						src={videoUrl}
						controls
						className="aspect-video w-full rounded-md bg-black"
					/>
				</div>

				<div className="rounded-r border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm text-blue-900">
					각 축을 0–10으로 채점하세요. 점수 밴드: A 8–10 · B 6–7.5 · C 4–5.5 · D
					0–3.5. 4축 전부 점수와 한국어 근거가 필요합니다.
				</div>

				{AXES.map((axis) => (
					<div
						key={axis.key}
						className="space-y-3 rounded-lg border bg-card p-4"
					>
						<FormField
							control={form.control}
							name={axis.key}
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-1.5">
										<span className="text-blue-600">◇</span> {axis.label}
									</FormLabel>
									<p className="text-xs text-muted-foreground">{axis.hint}</p>
									<FormControl>
										<Input
											type="number"
											min={0}
											max={10}
											step={0.5}
											inputMode="decimal"
											placeholder="0–10"
											className="w-28"
											value={field.value ?? ""}
											onChange={(e) =>
												field.onChange(
													e.target.value === ""
														? undefined
														: e.target.valueAsNumber,
												)
											}
											onBlur={field.onBlur}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name={`rationale.${axis.key}` as const}
							render={({ field }) => (
								<FormItem>
									<FormLabel className="text-xs text-muted-foreground">
										근거 (한국어)
									</FormLabel>
									<FormControl>
										<Textarea
											{...field}
											placeholder={axis.placeholder}
											maxLength={RATIONALE_MAX}
											className="min-h-[64px] bg-background"
										/>
									</FormControl>
									<KoreanCharCounter
										value={field.value ?? ""}
										max={RATIONALE_MAX}
									/>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				))}

				<FormField
					control={form.control}
					name="holisticGrade"
					render={({ field }) => (
						<FormItem className="rounded-lg border bg-card p-4">
							<FormLabel className="flex items-center gap-1.5">
								<span className="text-blue-600">◇</span> 종합 등급
							</FormLabel>
							<p className="text-xs text-muted-foreground">
								4축을 종합한 평가자 판단(계산 등급과 별개로 기록됩니다).
							</p>
							<FormControl>
								<Select value={field.value} onValueChange={field.onChange}>
									<SelectTrigger className="w-36">
										<SelectValue placeholder="등급 선택" />
									</SelectTrigger>
									<SelectContent>
										{GRADES.map((g) => (
											<SelectItem key={g} value={g}>
												{g}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-screen-sm border-t bg-background p-4">
					<Button
						type="submit"
						disabled={submitting}
						className="h-12 w-full text-base"
					>
						{submitting ? "제출 중..." : "채점 제출"}
					</Button>
				</div>
			</form>
		</Form>
	);
}

function errorMessage(
	error: "validation" | "not_assigned" | "failed",
	details?: string,
): string {
	switch (error) {
		case "validation":
			return details ?? "입력값을 다시 확인해 주세요.";
		case "not_assigned":
			return "이 제출에 대한 활성 배정이 없습니다. 큐를 새로고침해 주세요.";
		case "failed":
			return "제출에 실패했습니다. 다시 시도해 주세요.";
	}
}
