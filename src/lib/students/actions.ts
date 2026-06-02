"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/require-auth";
import { requireRole } from "@/lib/auth/require-role";
import { CURRENT_PARENT_CONSENT_VERSION } from "@/lib/consent/version";
import { db } from "@/lib/db/client";
import { students } from "@/lib/db/schema";
import {
	normalizeYear,
	type StudentFormInput,
	studentFormSchema,
} from "@/lib/students/schema";

export type ActionResult<T = void> =
	| { ok: true; data?: T }
	| { ok: false; error: string };

export async function createStudent(
	input: StudentFormInput,
): Promise<ActionResult<{ id: string }>> {
	const { academyId } = await requireRole(["owner", "admin"]);
	const parsed = studentFormSchema.safeParse(input);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0]?.message ?? "검증 실패" };

	const [row] = await db
		.insert(students)
		.values({
			academyId,
			name: parsed.data.name,
			year: normalizeYear(parsed.data.year),
			parentConsentOnFileAt: parsed.data.parentConsentOnFile
				? new Date()
				: null,
			parentConsentVersion: parsed.data.parentConsentOnFile
				? CURRENT_PARENT_CONSENT_VERSION
				: null,
		})
		.returning({ id: students.id });

	revalidatePath("/students");
	return { ok: true, data: { id: row.id } };
}

export async function updateStudent(
	id: string,
	input: StudentFormInput,
): Promise<ActionResult> {
	// Load auth first, then parse, then find existing, then check if consent changed
	const { academyId } = await requireAuth();

	const parsed = studentFormSchema.safeParse(input);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0]?.message ?? "검증 실패" };

	const existing = await db.query.students.findFirst({
		where: and(eq(students.id, id), eq(students.academyId, academyId)),
	});
	if (!existing) return { ok: false, error: "학생을 찾을 수 없습니다" };

	// Consent toggle requires owner/admin; compare against existing state
	const consentChanged =
		parsed.data.parentConsentOnFile !== !!existing.parentConsentOnFileAt;
	if (consentChanged) {
		await requireRole(["owner", "admin"]);
	}

	await db
		.update(students)
		.set({
			name: parsed.data.name,
			year: normalizeYear(parsed.data.year),
			parentConsentOnFileAt: parsed.data.parentConsentOnFile
				? (existing.parentConsentOnFileAt ?? new Date())
				: null,
			parentConsentVersion: parsed.data.parentConsentOnFile
				? (existing.parentConsentVersion ?? CURRENT_PARENT_CONSENT_VERSION)
				: null,
			updatedAt: new Date(),
		})
		.where(and(eq(students.id, id), eq(students.academyId, academyId)));

	revalidatePath("/students");
	revalidatePath(`/students/${id}`);
	return { ok: true };
}

export async function archiveStudent(id: string): Promise<ActionResult> {
	const { academyId } = await requireRole(["owner", "admin"]);

	const existing = await db.query.students.findFirst({
		where: and(eq(students.id, id), eq(students.academyId, academyId)),
	});
	if (!existing) return { ok: false, error: "학생을 찾을 수 없습니다" };
	if (existing.softDeletedAt)
		return { ok: false, error: "이미 삭제된 학생입니다" };

	await db
		.update(students)
		.set({
			name: `STUDENT_DELETED_${id}`,
			parentConsentArtifactUrl: null,
			softDeletedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(and(eq(students.id, id), eq(students.academyId, academyId)));

	revalidatePath("/students");
	return { ok: true };
}

export async function recordParentConsent(id: string): Promise<ActionResult> {
	const { academyId } = await requireRole(["owner", "admin"]);

	const existing = await db.query.students.findFirst({
		where: and(eq(students.id, id), eq(students.academyId, academyId)),
	});
	if (!existing) return { ok: false, error: "학생을 찾을 수 없습니다" };
	if (existing.softDeletedAt) return { ok: false, error: "삭제된 학생입니다" };

	// 이미 기록돼 있으면 멱등 no-op (중복 stamp 방지)
	if (existing.parentConsentOnFileAt) return { ok: true };

	await db
		.update(students)
		.set({
			parentConsentOnFileAt: new Date(),
			parentConsentVersion: CURRENT_PARENT_CONSENT_VERSION,
			updatedAt: new Date(),
		})
		.where(and(eq(students.id, id), eq(students.academyId, academyId)));

	revalidatePath("/students");
	revalidatePath(`/students/${id}`);
	return { ok: true };
}
