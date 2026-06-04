"use server";
import { and, eq, isNull } from "drizzle-orm";
import { assignSubmission } from "@/lib/assignment/actions";
import { requireConsumer } from "@/lib/auth/require-consumer";
import { CURRENT_UPLOADER_CONSENT_VERSION } from "@/lib/consent/version";
import { db } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import { SUBMISSION_VIDEOS_BUCKET } from "@/lib/evaluations/constants";
import {
	type ConsentIntakeFormInput,
	type CreateSubmissionInput,
	consentIntakeFormSchema,
	createSubmissionInputSchema,
} from "@/lib/forms/consent-intake-form";
import { checkEnqueueGate, isMinorFromBand } from "@/lib/submissions/intake";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ActionResult<T = void> =
	| { ok: true; data?: T }
	| { ok: false; error: string };

// 영상 lifecycle 만료 기본값(파라미터). 원본 영상 보관 상한 — WS1.2.
// TODO(lawyer): 정확한 보관 기간은 동의서 문구와 함께 확정.
const VIDEO_LIFECYCLE_DAYS = 30;

// WS3.3 — 소비자에게 노출하는 enqueue 거부 사유 한국어 문구.
function enqueueErrorMessage(
	reason: "no_consent" | "no_guardian" | "no_video",
): string {
	switch (reason) {
		case "no_consent":
			return "동의 절차를 먼저 완료해 주세요.";
		case "no_guardian":
			return "미성년자는 보호자 연락처가 필요합니다.";
		case "no_video":
			return "영상을 먼저 업로드해 주세요.";
	}
}

// 제출 row 생성(영상 첨부 전 draft 상태). 스키마 status enum 에 'draft' 가 없으므로
// "draft" 는 별도 enum 이 아니라 "아직 enqueue 게이트를 통과하지 않은 row"로 표현:
// video_storage_url=null + consent_recorded_at=null 인 상태가 곧 draft.
// (status 컬럼은 NOT NULL DEFAULT 'queued' 라 값은 'queued' 로 들어가지만,
//  enqueueSubmission 게이트 통과 전에는 평가 큐에 노출되지 않는다 — WS4 가 게이트.)
export async function createSubmission(
	input: CreateSubmissionInput,
): Promise<ActionResult<{ submissionId: string }>> {
	const user = await requireConsumer();
	const parsed = createSubmissionInputSchema.safeParse(input);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0]?.message ?? "검증 실패" };

	const expiresAt = new Date(
		Date.now() + VIDEO_LIFECYCLE_DAYS * 24 * 60 * 60 * 1000,
	);

	const [row] = await db
		.insert(submissions)
		.values({
			uploaderUserId: user.appUser.id,
			sceneType: parsed.data.sceneType,
			performanceYear: parsed.data.performanceYear ?? null,
			videoStorageUrl: null,
			videoLifecycleExpiresAt: expiresAt,
			// is_minor/age_band 는 NOT NULL — 동의 단계에서 갱신 전까지 보수적 기본값
			// (성인 가정 X: 미성년 가정이 안전. 다만 동의 단계에서 반드시 덮어씀).
			isMinor: true,
			ageBand: "14_18",
		})
		.returning({ id: submissions.id });

	return { ok: true, data: { submissionId: row.id } };
}

// 서명 업로드 URL 발급 — upload-action.ts createSignedUploadUrl 패턴 적용.
// 경로: `${uploaderId}/${submissionId}.mp4`, 버킷 submission-videos.
export async function createSubmissionUploadUrl(
	submissionId: string,
): Promise<
	{ ok: true; signedUrl: string; path: string } | { ok: false; error: string }
> {
	const user = await requireConsumer();
	const submission = await db.query.submissions.findFirst({
		where: and(
			eq(submissions.id, submissionId),
			eq(submissions.uploaderUserId, user.appUser.id),
			isNull(submissions.softDeletedAt),
		),
	});
	if (!submission) return { ok: false, error: "not_found" };

	const path = `${user.appUser.id}/${submissionId}.mp4`;
	const supabase = createServiceRoleClient();
	const { data, error } = await supabase.storage
		.from(SUBMISSION_VIDEOS_BUCKET)
		.createSignedUploadUrl(path);

	if (error || !data)
		return { ok: false, error: error?.message ?? "upload_url_failed" };
	return { ok: true, signedUrl: data.signedUrl, path };
}

// 업로드 완료 후 video_storage_url 기록.
export async function attachVideoToSubmission(
	submissionId: string,
	path: string,
): Promise<ActionResult> {
	const user = await requireConsumer();
	await db
		.update(submissions)
		.set({ videoStorageUrl: path, updatedAt: new Date() })
		.where(
			and(
				eq(submissions.id, submissionId),
				eq(submissions.uploaderUserId, user.appUser.id),
				isNull(submissions.softDeletedAt),
			),
		);
	return { ok: true };
}

// WS3.2 — 동의/연령 게이트 기록. recordParentConsent 일반화.
// then-current 버전 stamp + consent_recorded_at + is_minor/age_band/guardian_* 캡처.
export async function recordUploaderConsent(
	submissionId: string,
	input: ConsentIntakeFormInput,
): Promise<ActionResult> {
	const user = await requireConsumer();
	const parsed = consentIntakeFormSchema.safeParse(input);
	if (!parsed.success)
		return { ok: false, error: parsed.error.issues[0]?.message ?? "검증 실패" };

	const existing = await db.query.submissions.findFirst({
		where: and(
			eq(submissions.id, submissionId),
			eq(submissions.uploaderUserId, user.appUser.id),
			isNull(submissions.softDeletedAt),
		),
	});
	if (!existing) return { ok: false, error: "not_found" };

	// is_minor 는 서버에서 age_band 로 재파생(클라이언트 입력 신뢰 X).
	const isMinor = isMinorFromBand(parsed.data.ageBand);

	await db
		.update(submissions)
		.set({
			ageBand: parsed.data.ageBand,
			isMinor,
			guardianRelationship: isMinor
				? (parsed.data.guardianRelationship ?? null)
				: null,
			guardianContact: isMinor ? (parsed.data.guardianContact ?? null) : null,
			trainingOptIn: parsed.data.trainingOptIn,
			consentVersion: CURRENT_UPLOADER_CONSENT_VERSION,
			consentRecordedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(submissions.id, submissionId),
				eq(submissions.uploaderUserId, user.appUser.id),
			),
		);

	return { ok: true };
}

// WS3.3 — enqueue 게이트. 통과 시에만 status='queued' (큐 노출). 라우팅은 WS4.
export async function enqueueSubmission(
	submissionId: string,
): Promise<ActionResult> {
	const user = await requireConsumer();
	const existing = await db.query.submissions.findFirst({
		where: and(
			eq(submissions.id, submissionId),
			eq(submissions.uploaderUserId, user.appUser.id),
			isNull(submissions.softDeletedAt),
		),
	});
	if (!existing) return { ok: false, error: "not_found" };

	const gate = checkEnqueueGate({
		consentRecordedAt: existing.consentRecordedAt,
		isMinor: existing.isMinor,
		guardianContact: existing.guardianContact,
		videoStorageUrl: existing.videoStorageUrl,
	});
	if (!gate.ok) return { ok: false, error: enqueueErrorMessage(gate.reason) };

	await db
		.update(submissions)
		.set({ status: "queued", updatedAt: new Date() })
		.where(
			and(
				eq(submissions.id, submissionId),
				eq(submissions.uploaderUserId, user.appUser.id),
			),
		);

	// WS4 — enqueue 직후 라우팅 트리거(best-effort). 자격 평가자가 없거나 배정
	// 실패해도 enqueue 는 성공으로 둔다(제출은 queued 로 남고 assignQueued sweep 이
	// 나중에 픽업). 라우팅 예외가 소비자 제출 플로우를 깨지 않도록 try/catch 로 격리.
	try {
		await assignSubmission(submissionId);
	} catch {
		// 의도적 무시: 제출은 queued 로 남는다.
	}

	return { ok: true };
}
