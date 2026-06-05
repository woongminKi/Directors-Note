// Drizzle schema — 마이그레이션 0001_init.sql 의 미러.
// 이상적으론 `drizzle-kit pull` 으로 자동 생성하나, dev Supabase 셋업 전엔 수동 작성.
// PIPA 의견 후 마이그레이션 실행 후엔 `bun run db:pull` 으로 재생성.

import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
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
// 0014: academy_id nullable (소비자/플랫폼 평가자는 학원 없음), role 확장,
//   평가자 QA 컬럼 추가.
export const users = pgTable("users", {
	id: uuid("id").primaryKey(), // = auth.users.id
	academyId: uuid("academy_id").references(() => academies.id),
	role: text("role")
		.$type<"owner" | "coach" | "admin" | "consumer" | "evaluator">()
		.notNull(),
	email: text("email").notNull(),
	displayName: text("display_name"),
	kakaoId: text("kakao_id"),
	// 평가자 QA 필드 (nullable; 비-평가자는 null/default)
	interRaterScore: numeric("inter_rater_score", { precision: 4, scale: 3 }),
	labelsCompleted: integer("labels_completed").notNull().default(0),
	onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
	evaluatorStatus: text("evaluator_status").$type<
		"pending" | "active" | "suspended"
	>(),
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

// ─── submissions (B2C 소비자 업로드 진입 — 0014) ───────────────────
export const submissions = pgTable(
	"submissions",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		uploaderUserId: uuid("uploader_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		sceneType: text("scene_type").notNull(),
		performanceYear: text("performance_year"),
		videoStorageUrl: text("video_storage_url"), // 삭제 후 NULL
		videoLifecycleExpiresAt: timestamp("video_lifecycle_expires_at", {
			withTimezone: true,
		}).notNull(),
		consentArtifactUrl: text("consent_artifact_url"),
		consentVersion: text("consent_version"),
		consentRecordedAt: timestamp("consent_recorded_at", {
			withTimezone: true,
		}),
		isMinor: boolean("is_minor").notNull(),
		ageBand: text("age_band").$type<"under14" | "14_18" | "adult">().notNull(),
		guardianRelationship: text("guardian_relationship"),
		guardianContact: text("guardian_contact"),
		// 평가 동의 ≠ 영구 학습 동의 (§7.4 별도 옵트인)
		trainingOptIn: boolean("training_opt_in").notNull().default(false),
		status: text("status")
			.$type<"queued" | "assigned" | "scored" | "released">()
			.notNull()
			.default("queued"),
		paidAt: timestamp("paid_at", { withTimezone: true }), // WS7
		softDeletedAt: timestamp("soft_deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("age_band_enum", sql`${t.ageBand} IN ('under14','14_18','adult')`),
		check(
			"submissions_status_enum",
			sql`${t.status} IN ('queued','assigned','scored','released')`,
		),
		index("idx_submissions_uploader").on(t.uploaderUserId),
		index("idx_submissions_status").on(t.status),
	],
);

// ─── evaluation_assignments (라우팅 큐 — 0014) ─────────────────────
export const evaluationAssignments = pgTable(
	"evaluation_assignments",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => submissions.id, { onDelete: "cascade" }),
		evaluatorUserId: uuid("evaluator_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		assignedAt: timestamp("assigned_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		dueAt: timestamp("due_at", { withTimezone: true }).notNull(), // SLA
		status: text("status")
			.$type<"assigned" | "submitted" | "expired" | "reassigned">()
			.notNull()
			.default("assigned"),
		isRedundantLabel: boolean("is_redundant_label").notNull().default(false),
	},
	(t) => [
		check(
			"assignments_status_enum",
			sql`${t.status} IN ('assigned','submitted','expired','reassigned')`,
		),
		// 같은 제출-평가자 중복 배정 금지 (onConflictDoNothing race-safe)
		unique("evaluation_assignments_submission_evaluator_unique").on(
			t.submissionId,
			t.evaluatorUserId,
		),
		// 제출당 활성 primary 배정 1개 (부분 유니크)
		uniqueIndex("uq_active_primary_assignment")
			.on(t.submissionId)
			.where(sql`status = 'assigned' AND is_redundant_label = false`),
		index("idx_assignments_evaluator_status").on(t.evaluatorUserId, t.status),
	],
);

// ─── labeled_results (1급 라벨 데이터 — 0014) ──────────────────────
export const labeledResults = pgTable(
	"labeled_results",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => submissions.id, { onDelete: "cascade" }),
		evaluatorUserId: uuid("evaluator_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		vocalScore: numeric("vocal_score", { precision: 3, scale: 1 }).notNull(),
		expressionScore: numeric("expression_score", {
			precision: 3,
			scale: 1,
		}).notNull(),
		movementScore: numeric("movement_score", {
			precision: 3,
			scale: 1,
		}).notNull(),
		examReadinessScore: numeric("exam_readiness_score", {
			precision: 3,
			scale: 1,
		}).notNull(),
		holisticGrade: text("holistic_grade")
			.$type<"A" | "B" | "C" | "D">()
			.notNull(),
		derivedGrade: text("derived_grade")
			.$type<"A" | "B" | "C" | "D">()
			.notNull(),
		rationale: jsonb("rationale").notNull(), // 4축 한국어 근거
		rubricVersion: text("rubric_version").notNull(), // = JUDGE_RUBRIC_VERSION
		source: text("source")
			.$type<"human" | "cosine" | "llm_judge">()
			.notNull()
			.default("human"),
		isPrimary: boolean("is_primary").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("labeled_vocal_range", sql`${t.vocalScore} BETWEEN 0 AND 10`),
		check(
			"labeled_expression_range",
			sql`${t.expressionScore} BETWEEN 0 AND 10`,
		),
		check("labeled_movement_range", sql`${t.movementScore} BETWEEN 0 AND 10`),
		check(
			"labeled_exam_readiness_range",
			sql`${t.examReadinessScore} BETWEEN 0 AND 10`,
		),
		check("holistic_grade_enum", sql`${t.holisticGrade} IN ('A','B','C','D')`),
		check("derived_grade_enum", sql`${t.derivedGrade} IN ('A','B','C','D')`),
		check(
			"labeled_source_enum",
			sql`${t.source} IN ('human','cosine','llm_judge')`,
		),
		// 이중라벨 = 다른 평가자 행. submission 단독 유니크 금지.
		unique("labeled_results_submission_evaluator_unique").on(
			t.submissionId,
			t.evaluatorUserId,
		),
		index("idx_labeled_results_submission").on(t.submissionId),
		index("idx_labeled_results_evaluator").on(t.evaluatorUserId),
	],
);

// ─── push_subscriptions (웹푸시 구독 — 0018) ───────────────────────
export const pushSubscriptions = pgTable(
	"push_subscriptions",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		endpoint: text("endpoint").notNull(),
		p256dh: text("p256dh").notNull(),
		auth: text("auth").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("push_subscriptions_endpoint_unique").on(t.endpoint),
		index("idx_push_subscriptions_user").on(t.userId),
	],
);

// ─── notifications (발송 아웃박스 — 0018) ──────────────────────────
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: text("type")
			.$type<
				"submission_released" | "evaluator_assigned" | "submission_scored"
			>()
			.notNull(),
		channel: text("channel").$type<"web_push" | "alimtalk">().notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		url: text("url").notNull(),
		status: text("status")
			.$type<"pending" | "sent" | "failed">()
			.notNull()
			.default("pending"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		sentAt: timestamp("sent_at", { withTimezone: true }),
	},
	(t) => [
		check(
			"notifications_type_enum",
			sql`${t.type} IN ('submission_released','evaluator_assigned','submission_scored')`,
		),
		check(
			"notifications_channel_enum",
			sql`${t.channel} IN ('web_push','alimtalk')`,
		),
		check(
			"notifications_status_enum",
			sql`${t.status} IN ('pending','sent','failed')`,
		),
		index("idx_notifications_status").on(t.status),
	],
);

// ─── payment_orders (소비자 결제 주문/거래 — 0020) ─────────────────
export const paymentOrders = pgTable(
	"payment_orders",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => submissions.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		amount: integer("amount").notNull(),
		provider: text("provider").$type<"kakaopay" | "stub">().notNull(),
		providerTid: text("provider_tid"),
		status: text("status")
			.$type<"ready" | "approved" | "canceled" | "failed">()
			.notNull()
			.default("ready"),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check(
			"payment_orders_provider_enum",
			sql`${t.provider} IN ('kakaopay','stub')`,
		),
		check(
			"payment_orders_status_enum",
			sql`${t.status} IN ('ready','approved','canceled','failed')`,
		),
		index("idx_payment_orders_submission").on(t.submissionId),
		index("idx_payment_orders_status").on(t.status),
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

// ─── B2C relations (0014) ──────────────────────────────────────────
export const submissionsRelations = relations(submissions, ({ one, many }) => ({
	uploader: one(users, {
		fields: [submissions.uploaderUserId],
		references: [users.id],
	}),
	assignments: many(evaluationAssignments),
	labeledResults: many(labeledResults),
}));

export const evaluationAssignmentsRelations = relations(
	evaluationAssignments,
	({ one }) => ({
		submission: one(submissions, {
			fields: [evaluationAssignments.submissionId],
			references: [submissions.id],
		}),
		evaluator: one(users, {
			fields: [evaluationAssignments.evaluatorUserId],
			references: [users.id],
		}),
	}),
);

export const labeledResultsRelations = relations(labeledResults, ({ one }) => ({
	submission: one(submissions, {
		fields: [labeledResults.submissionId],
		references: [submissions.id],
	}),
	evaluator: one(users, {
		fields: [labeledResults.evaluatorUserId],
		references: [users.id],
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
export type Submission = InferSelectModel<typeof submissions>;
export type NewSubmission = InferInsertModel<typeof submissions>;
export type EvaluationAssignment = InferSelectModel<
	typeof evaluationAssignments
>;
export type NewEvaluationAssignment = InferInsertModel<
	typeof evaluationAssignments
>;
export type LabeledResult = InferSelectModel<typeof labeledResults>;
export type NewLabeledResult = InferInsertModel<typeof labeledResults>;
