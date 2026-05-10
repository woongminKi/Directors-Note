import { z } from "zod";

export const studentFormSchema = z.object({
	name: z.string().min(1, "이름은 필수입니다").max(40, "이름이 너무 깁니다"),
	year: z.string().min(1).max(20).optional(),
	parentConsentOnFile: z.boolean().default(false),
});

export type StudentFormInput = z.infer<typeof studentFormSchema>;
