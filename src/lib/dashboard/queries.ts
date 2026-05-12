import "server-only";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { EscalationInput } from "@/lib/dashboard/escalation-rules";
import { db } from "@/lib/db/client";
import {
	academies,
	aiAnalyses,
	evaluations,
	feedbackDrafts,
	students,
} from "@/lib/db/schema";

export type InternalGrade = "A" | "B" | "C" | "D";

export interface EvalTodoItem {
	studentId: string;
	studentName: string;
	year: string | null;
	lastGrade: InternalGrade | null;
}

export interface ReviewPendingItem {
	feedbackDraftId: string;
	evaluationId: string;
	studentId: string;
	studentName: string;
	year: string | null;
	internalGrade: InternalGrade | null;
	createdAt: Date;
}

export interface SentItem {
	feedbackDraftId: string;
	evaluationId: string;
	studentName: string;
	year: string | null;
	internalGrade: InternalGrade | null;
	sentAt: Date;
	parentViewedAt: Date | null; // v1: always null (no audit_log table)
}

export interface CoachProgress {
	userId: string;
	email: string;
	completed: number;
	pendingReview: number;
	sent: number;
	totalAssigned: number;
	progressRatio: number;
}

export interface AcademyMiniStats {
	academyName: string;
	totalStudents: number;
	thisMonthCompleted: number;
	cycleDeadline: string; // ISO date — last day of current month, v1 simple
}

// Alias to EscalationInput so the rules module is the single source of truth
// for the shape. Keeps deriveEscalations(escalation.data) call site type-safe.
export type EscalationData = EscalationInput;

// ─── 1) 평가 시작 큐 ───────────────────────────────────────────────
export async function getEvaluationTodo(
	academyId: string,
	_coachUserId: string,
): Promise<EvalTodoItem[]> {
	type Row = {
		student_id: string;
		student_name: string;
		year: string | null;
		last_grade: InternalGrade | null;
	};
	const rows = await db.execute<Row>(sql`
		WITH last_grade AS (
			SELECT DISTINCT ON (e.student_id)
				e.student_id, a.internal_grade
			FROM evaluations e
			JOIN ai_analyses a ON a.evaluation_id = e.id
			WHERE e.academy_id = ${academyId}
			ORDER BY e.student_id, e.evaluation_date DESC
		),
		this_month AS (
			SELECT student_id FROM evaluations
			WHERE academy_id = ${academyId}
			  AND evaluation_date >= date_trunc('month', now())
		)
		SELECT
			s.id::text AS student_id,
			s.name AS student_name,
			s.year,
			lg.internal_grade AS last_grade
		FROM students s
		LEFT JOIN last_grade lg ON lg.student_id = s.id
		WHERE s.academy_id = ${academyId}
		  AND s.soft_deleted_at IS NULL
		  AND s.id NOT IN (SELECT student_id FROM this_month)
		ORDER BY s.name
		LIMIT 20
	`);

	return rows.map((r) => ({
		studentId: r.student_id,
		studentName: r.student_name,
		year: r.year,
		lastGrade: r.last_grade,
	}));
}

// ─── 2) 검토 대기 큐 ───────────────────────────────────────────────
export async function getReviewPending(
	academyId: string,
	coachUserId: string,
): Promise<ReviewPendingItem[]> {
	const rows = await db
		.select({
			feedbackDraftId: feedbackDrafts.id,
			evaluationId: evaluations.id,
			studentId: students.id,
			studentName: students.name,
			year: students.year,
			internalGrade: aiAnalyses.internalGrade,
			createdAt: feedbackDrafts.createdAt,
		})
		.from(feedbackDrafts)
		.innerJoin(evaluations, eq(evaluations.id, feedbackDrafts.evaluationId))
		.innerJoin(students, eq(students.id, evaluations.studentId))
		.leftJoin(aiAnalyses, eq(aiAnalyses.evaluationId, evaluations.id))
		.where(
			and(
				eq(feedbackDrafts.academyId, academyId),
				eq(evaluations.coachUserId, coachUserId),
				eq(feedbackDrafts.status, "draft"),
			),
		)
		.orderBy(desc(feedbackDrafts.createdAt))
		.limit(20);

	return rows.map((r) => ({
		feedbackDraftId: r.feedbackDraftId,
		evaluationId: r.evaluationId,
		studentId: r.studentId,
		studentName: r.studentName,
		year: r.year,
		internalGrade: (r.internalGrade ?? null) as InternalGrade | null,
		createdAt: r.createdAt,
	}));
}

// ─── 3) 발송 완료 ──────────────────────────────────────────────────
export async function getSentRecent(
	academyId: string,
	coachUserId: string,
	limit = 10,
): Promise<SentItem[]> {
	const rows = await db
		.select({
			feedbackDraftId: feedbackDrafts.id,
			evaluationId: evaluations.id,
			studentName: students.name,
			year: students.year,
			internalGrade: aiAnalyses.internalGrade,
			sentAt: feedbackDrafts.sentAt,
		})
		.from(feedbackDrafts)
		.innerJoin(evaluations, eq(evaluations.id, feedbackDrafts.evaluationId))
		.innerJoin(students, eq(students.id, evaluations.studentId))
		.leftJoin(aiAnalyses, eq(aiAnalyses.evaluationId, evaluations.id))
		.where(
			and(
				eq(feedbackDrafts.academyId, academyId),
				eq(evaluations.coachUserId, coachUserId),
				eq(feedbackDrafts.status, "sent"),
			),
		)
		.orderBy(desc(feedbackDrafts.sentAt))
		.limit(limit);

	return rows.map((r) => ({
		feedbackDraftId: r.feedbackDraftId,
		evaluationId: r.evaluationId,
		studentName: r.studentName,
		year: r.year,
		internalGrade: (r.internalGrade ?? null) as InternalGrade | null,
		sentAt: r.sentAt ?? new Date(),
		parentViewedAt: null,
	}));
}

// ─── 4) Owner widget — 코치별 진행률 ───────────────────────────────
// All counters are scoped to the current calendar month so progressRatio
// reflects this-cycle work, not lifetime totals. totalStudents is merged
// into the same query via a CTE — saves one round-trip vs the prior split.
export async function getOwnerCoachProgress(
	academyId: string,
): Promise<CoachProgress[]> {
	type Row = {
		user_id: string;
		email: string;
		completed: number;
		pending: number;
		sent: number;
		total_students: number;
	};
	const rows = await db.execute<Row>(sql`
		WITH total_students AS (
			SELECT COUNT(*) AS c FROM students
			WHERE academy_id = ${academyId} AND soft_deleted_at IS NULL
		)
		SELECT
			u.id::text AS user_id,
			u.email,
			COUNT(DISTINCT e.id) FILTER (
				WHERE e.evaluation_date >= date_trunc('month', now())
			) AS completed,
			COUNT(DISTINCT fd.id) FILTER (
				WHERE fd.status = 'draft'
				  AND e.evaluation_date >= date_trunc('month', now())
			) AS pending,
			COUNT(DISTINCT fd.id) FILTER (
				WHERE fd.status = 'sent'
				  AND e.evaluation_date >= date_trunc('month', now())
			) AS sent,
			(SELECT c FROM total_students) AS total_students
		FROM users u
		LEFT JOIN evaluations e ON e.coach_user_id = u.id AND e.academy_id = ${academyId}
		LEFT JOIN feedback_drafts fd ON fd.evaluation_id = e.id
		WHERE u.academy_id = ${academyId} AND u.role IN ('coach', 'owner')
		GROUP BY u.id, u.email
		ORDER BY u.email
	`);

	return rows.map((r) => {
		const completed = Number(r.completed);
		const pending = Number(r.pending);
		const sent = Number(r.sent);
		const totalStudents = Number(r.total_students);
		const assigned =
			totalStudents > 0 ? totalStudents : completed + pending + sent;
		return {
			userId: r.user_id,
			email: r.email,
			completed,
			pendingReview: pending,
			sent,
			totalAssigned: assigned,
			progressRatio: assigned > 0 ? (completed + sent) / assigned : 0,
		};
	});
}

// ─── 5) Academy mini stats ─────────────────────────────────────────
export async function getAcademyMiniStats(
	academyId: string,
): Promise<AcademyMiniStats> {
	const academyRows = await db
		.select({ name: academies.name })
		.from(academies)
		.where(eq(academies.id, academyId))
		.limit(1);
	const academyName = academyRows[0]?.name ?? "(학원 이름 없음)";

	const studentRows = await db
		.select({ c: count() })
		.from(students)
		.where(
			and(eq(students.academyId, academyId), isNull(students.softDeletedAt)),
		);
	const totalStudents = studentRows[0]?.c ?? 0;

	const monthCountRows = await db.execute<{ c: number }>(sql`
		SELECT COUNT(DISTINCT student_id)::int AS c
		FROM evaluations
		WHERE academy_id = ${academyId}
		  AND evaluation_date >= date_trunc('month', now())
	`);
	const thisMonthCompleted = Number(monthCountRows[0]?.c ?? 0);

	// v1: cycle deadline = 이번 달 마지막 날
	const now = new Date();
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	const cycleDeadline = lastDay.toISOString().slice(0, 10);

	return {
		academyName,
		totalStudents,
		thisMonthCompleted,
		cycleDeadline,
	};
}

// ─── 6) Escalation data — for derivation in escalation-rules.ts ────
export async function getEscalationData(
	academyId: string,
): Promise<EscalationData> {
	type RegRow = {
		student_id: string;
		student_name: string;
		previous: InternalGrade;
		current: InternalGrade;
	};
	const regressions = await db.execute<RegRow>(sql`
		WITH ranked AS (
			SELECT
				e.student_id,
				s.name AS student_name,
				a.internal_grade,
				e.evaluation_date,
				ROW_NUMBER() OVER (PARTITION BY e.student_id ORDER BY e.evaluation_date DESC) AS rn
			FROM evaluations e
			JOIN ai_analyses a ON a.evaluation_id = e.id
			JOIN students s ON s.id = e.student_id
			WHERE e.academy_id = ${academyId}
		)
		SELECT
			r1.student_id::text AS student_id,
			r1.student_name,
			r2.internal_grade AS previous,
			r1.internal_grade AS current
		FROM ranked r1
		JOIN ranked r2 ON r2.student_id = r1.student_id AND r2.rn = 2
		WHERE r1.rn = 1
		  AND r1.internal_grade > r2.internal_grade  -- 'C' > 'B' (worse alphabetically)
		ORDER BY r1.student_name
	`);

	// AI failure heuristic v1: no failure-event table yet, so this returns 0.
	// When a failure log lands, query for last-24h count and replace below.
	const aiFailuresLast24h = 0;

	return {
		studentGradeRegressions: regressions.map((r) => ({
			studentId: r.student_id,
			studentName: r.student_name,
			previous: r.previous,
			current: r.current,
		})),
		aiFailuresLast24h,
	};
}
