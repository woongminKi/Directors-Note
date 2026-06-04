"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
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
import { Switch } from "@/components/ui/switch";
import { UPLOADER_CONSENT_VERSION_LABEL } from "@/lib/consent/version";
import {
	type ConsentIntakeFormInput,
	type ConsentIntakeFormValues,
	consentIntakeFormSchema,
} from "@/lib/forms/consent-intake-form";
import { recordUploaderConsent } from "@/lib/submissions/actions";
import { isMinorFromBand } from "@/lib/submissions/intake";

export function ConsentIntakeForm({
	submissionId,
	guardianVerification,
	onRecorded,
}: {
	submissionId: string;
	guardianVerification: boolean;
	onRecorded: () => void | Promise<void>;
}) {
	const [submitting, setSubmitting] = useState(false);

	const form = useForm<
		ConsentIntakeFormValues,
		unknown,
		ConsentIntakeFormInput
	>({
		resolver: zodResolver(consentIntakeFormSchema),
		defaultValues: {
			ageBand: "14_18",
			isMinor: true,
			guardianRelationship: "",
			guardianContact: "",
			consentAgreed: false as unknown as true,
			trainingOptIn: false,
		},
	});

	const ageBand = form.watch("ageBand");
	const isMinor = isMinorFromBand(ageBand);
	// is_minor 는 age_band 에서 파생해 폼 값에 반영(서버가 다시 재검증).
	if (form.getValues("isMinor") !== isMinor) form.setValue("isMinor", isMinor);

	const onSubmit = async (input: ConsentIntakeFormInput) => {
		setSubmitting(true);
		try {
			const res = await recordUploaderConsent(submissionId, {
				...input,
				isMinor,
			});
			if (res.ok) {
				await onRecorded();
			} else {
				toast.error(res.error);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "알 수 없는 오류");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
				{/* TODO(lawyer): 아래 동의 문구·연령 임계는 모두 placeholder.
				    한국 PIPA 아동 동의 임계/보호자 검증 강도/문구는 변호사 사인오프 대기.
				    FEATURE_B2C_INTAKE_OPEN=false 가 prod 노출을 막는다. */}
				<div className="rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-900">
					[검토 중] 본 동의 문구와 연령 기준은 초안이며 법률 검토 진행 중입니다.
					({UPLOADER_CONSENT_VERSION_LABEL})
				</div>

				<FormField
					control={form.control}
					name="ageBand"
					render={({ field }) => (
						<FormItem>
							<FormLabel>연령대</FormLabel>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="연령대를 선택" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{/* TODO(lawyer): 임계(만 14/18) placeholder */}
									<SelectItem value="under14">만 14세 미만</SelectItem>
									<SelectItem value="14_18">만 14세 ~ 18세 미만</SelectItem>
									<SelectItem value="adult">성인 (만 18세 이상)</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				{isMinor && (
					<div className="space-y-4 rounded-lg border bg-card p-4">
						<p className="text-sm font-medium">보호자(법정대리인) 동의 정보</p>
						<FormField
							control={form.control}
							name="guardianRelationship"
							render={({ field }) => (
								<FormItem>
									<FormLabel>보호자와의 관계</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="예: 모, 부, 법정대리인"
											maxLength={40}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="guardianContact"
							render={({ field }) => (
								<FormItem>
									<FormLabel>보호자 연락처</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="예: 010-0000-0000"
											maxLength={120}
										/>
									</FormControl>
									<FormDescription>
										{guardianVerification
											? "보호자 본인인증이 필요합니다."
											: "Phase A 는 보호자 연락처 자가입력입니다. (본인인증 미적용 — 추후 도입 예정)"}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				)}

				<FormField
					control={form.control}
					name="consentAgreed"
					render={({ field }) => (
						<FormItem className="flex items-center justify-between rounded-lg border p-4">
							<div className="space-y-0.5 pr-3">
								<FormLabel>
									평가를 위한 개인정보 처리에 동의합니다 (필수)
								</FormLabel>
								<FormDescription>
									사람 평가자가 영상을 평가하기 위한 처리 동의입니다.{" "}
									<Link
										href="/parent-consent"
										target="_blank"
										rel="noopener noreferrer"
										className="underline"
									>
										동의 내용 보기
									</Link>
								</FormDescription>
							</div>
							<FormControl>
								<Switch
									checked={field.value === true}
									onCheckedChange={(c) => field.onChange(c)}
								/>
							</FormControl>
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="trainingOptIn"
					render={({ field }) => (
						<FormItem className="flex items-center justify-between rounded-lg border p-4">
							<div className="space-y-0.5 pr-3">
								<FormLabel>
									평가 데이터의 서비스 개선 활용에 동의합니다 (선택)
								</FormLabel>
								<FormDescription>
									{/* TODO(lawyer): §7.4 미성년 영구 학습 보존 문구 — 최고위험, 사인오프 대기 */}
									별도 동의입니다. 동의하지 않아도 평가는 정상 진행됩니다.
								</FormDescription>
							</div>
							<FormControl>
								<Switch
									checked={field.value === true}
									onCheckedChange={(c) => field.onChange(c === true)}
								/>
							</FormControl>
						</FormItem>
					)}
				/>

				<Button
					type="submit"
					disabled={submitting}
					className="h-12 w-full text-base"
				>
					{submitting ? "제출 중…" : "동의하고 제출하기"}
				</Button>
			</form>
		</Form>
	);
}
