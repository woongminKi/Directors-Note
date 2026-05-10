import { z } from "zod";

export const coachBulletFormSchema = z
	.object({
		studentId: z.string().uuid("학생 ID 형식 오류"),
		evaluationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식 필요"),
		year: z.string().min(1).max(20),
		bullets: z.object({
			vocal: z.string().max(200).optional(),
			diction: z.string().max(200).optional(),
			expression: z.string().max(200).optional(),
			movement: z.string().max(200).optional(),
			examReadiness: z.string().max(200).optional(),
			freeNote: z.string().max(300).optional(),
		}),
	})
	.refine(
		(input) => {
			const requiredKeys: Array<keyof typeof input.bullets> = [
				"vocal",
				"diction",
				"expression",
				"movement",
				"examReadiness",
			];
			const filled = requiredKeys.filter((k) => {
				const v = input.bullets[k];
				return typeof v === "string" && v.trim().length > 0;
			}).length;
			return filled >= 2;
		},
		{
			message: "최소 2개 이상의 항목을 작성해 주세요. (자유 메모 제외)",
			path: ["bullets"],
		},
	);

export type CoachBulletFormInput = z.infer<typeof coachBulletFormSchema>;
