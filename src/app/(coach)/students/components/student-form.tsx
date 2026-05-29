"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
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
import { Switch } from "@/components/ui/switch";
import {
	CONSENT_VERSION_LABEL,
	CURRENT_PARENT_CONSENT_VERSION,
} from "@/lib/consent/version";
import {
	type StudentFormInput,
	studentFormSchema,
} from "@/lib/students/schema";

type StudentFormValues = z.input<typeof studentFormSchema>;

export type StudentFormProps = {
	defaultValues?: Partial<StudentFormInput>;
	canEditConsent: boolean;
	onSubmit: (
		input: StudentFormInput,
	) => Promise<{ ok: boolean; error?: string }>;
	submitLabel: string;
};

export function StudentForm({
	defaultValues,
	canEditConsent,
	onSubmit,
	submitLabel,
}: StudentFormProps) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm<StudentFormValues, unknown, StudentFormInput>({
		resolver: zodResolver(studentFormSchema),
		defaultValues: {
			name: "",
			year: "",
			parentConsentOnFile: false,
			...defaultValues,
		},
	});

	const handle = async (data: StudentFormInput) => {
		setError(null);
		const res = await onSubmit(data);
		if (!res.ok) setError(res.error ?? "저장 실패");
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(handle)} className="space-y-4">
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>이름</FormLabel>
							<FormControl>
								<Input {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="year"
					render={({ field }) => (
						<FormItem>
							<FormLabel>구분 (예: 1년차, 2년차, 재수생)</FormLabel>
							<FormControl>
								<Input {...field} value={field.value ?? ""} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="parentConsentOnFile"
					render={({ field }) => (
						<FormItem className="space-y-2 rounded border p-3">
							<div className="flex items-center justify-between gap-3">
								<FormLabel className="flex-1">
									<div className="space-y-0.5">
										<div>부모 동의서 받음</div>
										<div className="text-xs font-normal text-muted-foreground">
											현행 버전 {CURRENT_PARENT_CONSENT_VERSION} ·{" "}
											{CONSENT_VERSION_LABEL}
										</div>
									</div>
								</FormLabel>
								<FormControl>
									<Switch
										checked={field.value}
										onCheckedChange={field.onChange}
										disabled={!canEditConsent}
									/>
								</FormControl>
							</div>
							<a
								className="text-xs text-muted-foreground underline"
								href="/parent-consent"
								target="_blank"
								rel="noreferrer"
							>
								동의서 전문 보기 →
							</a>
						</FormItem>
					)}
				/>
				{error && <p className="text-sm text-destructive">{error}</p>}
				<Button
					type="submit"
					className="w-full"
					disabled={form.formState.isSubmitting}
				>
					{form.formState.isSubmitting ? "저장 중…" : submitLabel}
				</Button>
			</form>
		</Form>
	);
}
