import { z } from "zod";

// WS3.2 소비자 동의/연령 게이트 폼 스키마. coach-bullet-form.ts 형제 스타일.
// 미성년이면 보호자 관계·연락처 필수(WS3.3 enqueue 게이트와 일치).
// TODO(lawyer): 연령 임계/동의 문구/학습 옵트인 문구는 변호사 사인오프 대기(BLOCKING #1/#2).

export const ageBandSchema = z.enum(["under14", "14_18", "adult"]);

export const consentIntakeFormSchema = z
	.object({
		ageBand: ageBandSchema,
		// is_minor 는 클라이언트에서 ageBand 로 파생해 보내되, 서버가 재검증/재파생한다.
		isMinor: z.boolean(),
		guardianRelationship: z.string().trim().max(40).optional(),
		guardianContact: z.string().trim().max(120).optional(),
		// 평가 동의(필수): 사람 평가 진행을 위한 개인정보 처리 동의.
		consentAgreed: z.literal(true, {
			message: "평가 진행을 위한 동의가 필요합니다.",
		}),
		// 영구 학습 데이터 옵트인(별도·선택): is_minor 와 의도적으로 분리(§7.4).
		// 옵트인이므로 미입력=미동의(false) 가 안전한 기본값.
		trainingOptIn: z.boolean().default(false),
	})
	.refine((v) => !v.isMinor || nonEmpty(v.guardianRelationship), {
		message: "미성년자는 보호자와의 관계를 입력해 주세요.",
		path: ["guardianRelationship"],
	})
	.refine((v) => !v.isMinor || nonEmpty(v.guardianContact), {
		message: "미성년자는 보호자 연락처를 입력해 주세요.",
		path: ["guardianContact"],
	});

// 파싱 후(서버 액션이 받는) 타입 — trainingOptIn 등 default 적용 완료.
export type ConsentIntakeFormInput = z.infer<typeof consentIntakeFormSchema>;
// 폼(react-hook-form)이 다루는 입력 타입 — default 전이라 trainingOptIn optional.
export type ConsentIntakeFormValues = z.input<typeof consentIntakeFormSchema>;

// 신규 제출 생성 입력(영상 첨부 전 메타). scene_type 등 인테이크 메타.
export const createSubmissionInputSchema = z.object({
	sceneType: z.string().trim().min(1, "장면 유형을 입력해 주세요.").max(60),
	performanceYear: z.string().trim().max(20).optional(),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionInputSchema>;

function nonEmpty(v: string | undefined): boolean {
	return typeof v === "string" && v.trim().length > 0;
}
