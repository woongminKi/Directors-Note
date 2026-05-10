import "server-only";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluations, feedbackDrafts, students } from "@/lib/db/schema";

export type StudentListFilter = "active" | "no_consent" | "archived";

export async function listStudents(
	academyId: string,
	filter: StudentListFilter = "active",
) {
	const archivedClause =
		filter === "archived"
			? isNotNull(students.softDeletedAt)
			: isNull(students.softDeletedAt);
	const consentClause =
		filter === "active"
			? isNotNull(students.parentConsentOnFileAt)
			: filter === "no_consent"
				? isNull(students.parentConsentOnFileAt)
				: undefined;

	const rows = await db
		.select({
			id: students.id,
			name: students.name,
			year: students.year,
			parentConsentOnFileAt: students.parentConsentOnFileAt,
			lastEvalDate: sql<string | null>`(
				SELECT MAX(${evaluations.evaluationDate})
				FROM ${evaluations}
				WHERE ${evaluations.studentId} = ${students.id}
			)`.as("last_eval_date"),
		})
		.from(students)
		.where(
			and(eq(students.academyId, academyId), archivedClause, consentClause),
		)
		.orderBy(students.name);

	return rows;
}

export async function getStudent(academyId: string, id: string) {
	return db.query.students.findFirst({
		where: and(
			eq(students.id, id),
			eq(students.academyId, academyId),
			isNull(students.softDeletedAt),
		),
	});
}

export async function getRecentEvaluationsForStudent(
	academyId: string,
	studentId: string,
	limit = 3,
) {
	return db
		.select({
			id: evaluations.id,
			evaluationDate: evaluations.evaluationDate,
			status: feedbackDrafts.status,
		})
		.from(evaluations)
		.leftJoin(feedbackDrafts, eq(feedbackDrafts.evaluationId, evaluations.id))
		.where(
			and(
				eq(evaluations.studentId, studentId),
				eq(evaluations.academyId, academyId),
			),
		)
		.orderBy(desc(evaluations.evaluationDate))
		.limit(limit);
}
