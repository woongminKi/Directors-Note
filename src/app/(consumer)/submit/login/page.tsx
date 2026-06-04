import { ConsumerLoginButton } from "./login-button";

// WS3.6 — 소비자 카카오 로그인 진입점. next 기본값 /submit 가 콜백에서 소비자
// 자동 프로비저닝(role='consumer', academy_id=null)을 트리거한다.
export default function ConsumerLoginPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	return (
		<div className="mx-auto w-full max-w-sm space-y-6 py-12 text-center">
			<h1 className="text-2xl font-bold">영상 평가 받기</h1>
			<p className="text-sm text-muted-foreground">
				카카오로 로그인하고 연기 영상을 제출해 보세요.
			</p>
			<ConsumerLoginButton searchParamsPromise={searchParams} />
		</div>
	);
}
