// 부모 동의서 현행 버전 상수.
// 동의서 문안 변경 시 새 버전 (날짜 + 차수) 발급하고 /parent-consent 페이지 갱신.
// 학생 row 의 parent_consent_version 에 발효 시점의 버전이 stamp 됨.
export const CURRENT_PARENT_CONSENT_VERSION = "2026-05-21-v2";

export const CONSENT_VERSION_LABEL = "v2 (영상 기반 AI 분석 동의 포함)";

// B2C 소비자(자가/보호자) 업로드 동의 현행 버전 상수 — WS3.2.
// 학생-tied 부모 동의(CURRENT_PARENT_CONSENT_VERSION)와 별개:
// 소비자가 본인(또는 미성년자의 보호자로서) 직접 업로드 시 stamp 됨.
// submissions.consent_version 에 발효 시점 버전이 기록된다.
// TODO(lawyer): 동의 문구·연령 임계 확정 시 버전 갱신 + 인테이크 동의 페이지 동기화.
export const CURRENT_UPLOADER_CONSENT_VERSION = "2026-06-04-b2c-draft";

export const UPLOADER_CONSENT_VERSION_LABEL =
	"B2C v1 초안 (사람 평가 · 미성년 보호자 동의 · 학습 옵트인)";
