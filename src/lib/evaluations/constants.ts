// 학생 평가 영상 저장 버킷 이름.
// 별도 모듈에 분리: upload-action.ts 는 `"use server"` 라 async function 만
// export 가능 — non-function const 를 같이 export 하면 Next.js build 가 모든
// export 를 차단함. 이 상수를 별도 plain 모듈로 빼서 server/client 양쪽이
// 안전하게 import 가능.
export const STUDENT_VIDEOS_BUCKET = "student-videos";

// B2C 소비자 제출 영상 버킷 (0016 에서 생성됨, private + 500MB + mp4/mov/webm/mkv).
// 경로 관례: `${uploaderUserId}/${submissionId}.mp4` (storage RLS 1번째 폴더 = auth.uid()).
export const SUBMISSION_VIDEOS_BUCKET = "submission-videos";
