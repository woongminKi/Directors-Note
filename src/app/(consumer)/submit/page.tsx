import { requireConsumer } from "@/lib/auth/require-consumer";
import { env } from "@/lib/env";
import { SubmissionIntakeFlow } from "./intake-flow";

// WS3 — 소비자 업로드 인테이크 진입. requireConsumer 가 미인증/비-소비자를
// 소비자 로그인으로 보낸다. 본인인증 강도(FEATURE_GUARDIAN_VERIFICATION)는
// 클라이언트 동의 폼에 전달(Phase A 는 자가입력 stub).
export default async function SubmitPage() {
	await requireConsumer();
	const guardianVerification = env.FEATURE_GUARDIAN_VERIFICATION === "true";

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-xl font-bold">영상 제출</h1>
				<p className="text-sm text-muted-foreground">
					연기 영상을 업로드하고 동의 절차를 완료하면 사람 평가자가 평가합니다.
				</p>
			</header>
			<SubmissionIntakeFlow guardianVerification={guardianVerification} />
		</div>
	);
}
