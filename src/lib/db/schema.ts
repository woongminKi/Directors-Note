// Drizzle schema — 마이그레이션 0001_init.sql 의 미러.
// 이상적으론 `drizzle-kit pull` 으로 자동 생성하나, dev Supabase 셋업 전엔 수동 작성.
// PIPA 의견 후 마이그레이션 실행 후엔 `bun run db:pull` 으로 재생성.

import { sql } from "drizzle-orm";
import {
	check,
	date,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	// pgvector 관련 type 은 drizzle-orm 0.30+ 에서 vector helper 제공
	// import { vector } from 'drizzle-orm/pg-core'  // 또는 custom type
} from "drizzle-orm/pg-core";

// ─── academies ─────────────────────────────────────────────────────
export const academies = pgTable("academies", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	name: text("name").notNull(),
	billingStatus: text("billing_status").notNull().default("free_pilot"),
	seatCount: integer("seat_count").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ─── users (Supabase auth.users 와 1:1) ────────────────────────────
export const users = pgTable("users", {
	id: uuid("id").primaryKey(), // = auth.users.id
	academyId: uuid("academy_id")
		.notNull()
		.references(() => academies.id),
	role: text("role").$type<"owner" | "coach" | "admin">().notNull(),
	email: text("email").notNull(),
	displayName: text("display_name"),
	kakaoId: text("kakao_id"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ─── students ──────────────────────────────────────────────────────
export const students = pgTable("students", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	academyId: uuid("academy_id")
		.notNull()
		.references(() => academies.id),
	name: text("name").notNull(),
	year: text("year"),
	parentConsentOnFileAt: timestamp("parent_consent_on_file_at", {
		withTimezone: true,
	}),
	parentConsentArtifactUrl: text("parent_consent_artifact_url"),
	parentConsentVersion: text("parent_consent_version"),
	softDeletedAt: timestamp("soft_deleted_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ─── reference_videos ──────────────────────────────────────────────
export const referenceVideos = pgTable("reference_videos", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	academyId: uuid("academy_id")
		.notNull()
		.references(() => academies.id),
	level: text("level").notNull(), // 'A' | 'B' | 'C' | 'D'
	sceneType: text("scene_type").notNull(),
	techniqueTag: text("technique_tag"),
	storageUrl: text("storage_url").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ─── evaluations ───────────────────────────────────────────────────
export const evaluations = pgTable(
	"evaluations",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		academyId: uuid("academy_id")
			.notNull()
			.references(() => academies.id), // D9 비정규화
		studentId: uuid("student_id")
			.notNull()
			.references(() => students.id),
		coachUserId: uuid("coach_user_id")
			.notNull()
			.references(() => users.id),
		evaluationDate: date("evaluation_date").notNull(),
		videoStorageUrl: text("video_storage_url"), // right-to-delete 후 NULL
		videoLifecycleExpiresAt: timestamp("video_lifecycle_expires_at", {
			withTimezone: true,
		}).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// 0005: race-safe — 같은 학생/같은 날짜 row 최대 1개
		unique("evaluations_student_date_unique").on(t.studentId, t.evaluationDate),
	],
);

// ─── ai_analyses (3 axes for v1) ───────────────────────────────────
export const aiAnalyses = pgTable(
	"ai_analyses",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		academyId: uuid("academy_id")
			.notNull()
			.references(() => academies.id), // D9
		evaluationId: uuid("evaluation_id")
			.notNull()
			.unique()
			.references(() => evaluations.id, { onDelete: "cascade" }),
		vocalScore: numeric("vocal_score", { precision: 3, scale: 1 }),
		expressionScore: numeric("expression_score", { precision: 3, scale: 1 }),
		examReadinessScore: numeric("exam_readiness_score", {
			precision: 3,
			scale: 1,
		}),
		internalGrade: text("internal_grade").notNull(), // 코치 only — P2 hold
		calibrationMatchScore: numeric("calibration_match_score", {
			precision: 4,
			scale: 3,
		}),
		evaluatorUsed: text("evaluator_used").notNull(), // 'cosine' | 'llm_as_judge'
		cosineConfidence: numeric("cosine_confidence", { precision: 4, scale: 3 }),
		rawResponseJson: jsonb("raw_response_json").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("vocal_range", sql`${t.vocalScore} BETWEEN 0 AND 10`),
		check("expression_range", sql`${t.expressionScore} BETWEEN 0 AND 10`),
		check(
			"exam_readiness_range",
			sql`${t.examReadinessScore} BETWEEN 0 AND 10`,
		),
		check("grade_enum", sql`${t.internalGrade} IN ('A','B','C','D')`),
		check(
			"evaluator_enum",
			sql`${t.evaluatorUsed} IN ('cosine','llm_as_judge')`,
		),
	],
);

// ─── feedback_drafts ───────────────────────────────────────────────
export const feedbackDrafts = pgTable(
	"feedback_drafts",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		academyId: uuid("academy_id")
			.notNull()
			.references(() => academies.id), // D9
		evaluationId: uuid("evaluation_id")
			.notNull()
			.unique()
			.references(() => evaluations.id, { onDelete: "cascade" }),
		aiDraftText: text("ai_draft_text").notNull(),
		coachEditedText: text("coach_edited_text"),
		status: text("status").notNull().default("draft"),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		shareLinkTokenHash: text("share_link_token_hash").unique(),
		shareLinkExpiresAt: timestamp("share_link_expires_at", {
			withTimezone: true,
		}),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("status_enum", sql`${t.status} IN ('draft','approved','sent')`),
	],
);

// ─── embeddings (pgvector) ─────────────────────────────────────────
// vector(1408) 은 drizzle-orm 의 vector helper 또는 custom type 으로 표현.
// 실제 DDL 은 0001_init.sql 의 vector(1408) 사용.
// Drizzle introspect 후 자동 생성될 것.
export type Embedding = {
	id: string;
	academyId: string;
	sourceType: "reference_video" | "evaluation";
	sourceReferenceVideoId: string | null;
	sourceEvaluationId: string | null;
	vector: number[]; // length 1408
	createdAt: Date;
};

// ─── relations ────────────────────────────────────────────────────────────────
import { relations } from "drizzle-orm";

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
	student: one(students, {
		fields: [evaluations.studentId],
		references: [students.id],
	}),
	feedbackDraft: one(feedbackDrafts, {
		fields: [evaluations.id],
		references: [feedbackDrafts.evaluationId],
	}),
	aiAnalysis: one(aiAnalyses, {
		fields: [evaluations.id],
		references: [aiAnalyses.evaluationId],
	}),
}));

export const studentsRelations = relations(students, ({ many }) => ({
	evaluations: many(evaluations),
}));

export const feedbackDraftsRelations = relations(feedbackDrafts, ({ one }) => ({
	evaluation: one(evaluations, {
		fields: [feedbackDrafts.evaluationId],
		references: [evaluations.id],
	}),
}));

export const aiAnalysesRelations = relations(aiAnalyses, ({ one }) => ({
	evaluation: one(evaluations, {
		fields: [aiAnalyses.evaluationId],
		references: [evaluations.id],
	}),
}));

// 타입 helpers
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
export type Academy = InferSelectModel<typeof academies>;
export type NewAcademy = InferInsertModel<typeof academies>;
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Student = InferSelectModel<typeof students>;
export type NewStudent = InferInsertModel<typeof students>;
export type ReferenceVideo = InferSelectModel<typeof referenceVideos>;
export type Evaluation = InferSelectModel<typeof evaluations>;
export type NewEvaluation = InferInsertModel<typeof evaluations>;
export type AIAnalysisRow = InferSelectModel<typeof aiAnalyses>;
export type NewAIAnalysisRow = InferInsertModel<typeof aiAnalyses>;
export type FeedbackDraft = InferSelectModel<typeof feedbackDrafts>;
export type NewFeedbackDraft = InferInsertModel<typeof feedbackDrafts>;
