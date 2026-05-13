import { z } from "zod";

// year is conceptually optional (data model: nullable text). The form's
// controlled <Input> defaults to "" since React controlled components
// can't be undefined, which means a bare `.min(1).optional()` would
// reject every empty submission with zod's English default. Drop the
// lower bound; the action layer maps blank/whitespace to null before
// insert (see actions.ts createStudent/updateStudent).
export const studentFormSchema = z.object({
	name: z.string().min(1, "이름은 필수입니다").max(40, "이름이 너무 깁니다"),
	year: z.string().max(20, "구분이 너무 깁니다 (최대 20자)").optional(),
	parentConsentOnFile: z.boolean().default(false),
});

export type StudentFormInput = z.infer<typeof studentFormSchema>;

// Action-layer normalizer — keeps the form schema simple but stops empty
// strings from landing in the nullable `year` column.
export function normalizeYear(year: string | undefined): string | null {
	if (!year) return null;
	const trimmed = year.trim();
	return trimmed === "" ? null : trimmed;
}
