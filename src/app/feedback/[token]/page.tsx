// 부모 share-link 페이지 — 인증 X, 토큰 게이트 only.
// 디자인 D-D1 B안 (카드형 리포트) 그대로.

interface PageProps {
	params: Promise<{ token: string }>;
}

export default async function ParentFeedbackPage({ params }: PageProps) {
	const { token } = await params;

	// TODO: DB 셋업 후 RPC get_parent_feedback(token) 호출.
	// 현재는 stub data 로 디자인 검증.
	const isPreview = token === "preview-token";

	const data = isPreview
		? {
				academyName: "스타라이트 연기학원",
				studentName: "박지윤",
				evaluationDate: "2026년 5월 정기 평가 · 5월 9일",
				summary: "안정적 발전 · 입시 70% 수준",
				feedback: `이번 달 평가 영상 잘 받았습니다.

이번 발표는 호흡 안정도가 지난달 대비 눈에 띄게 좋아졌습니다. 특히 모놀로그 후반부 감정 빌드업이 자연스러웠고, 발음 또한 명확했습니다.

표정 연기는 기쁨/슬픔 전환 시 약간의 어색함이 있었습니다. 다음 평가까지 표정 변화 연습을 권합니다.`,
				observations: [
					{ tag: "발전", text: "호흡 안정도, 발음 명확도" },
					{ tag: "유지", text: "감정 빌드업 자연스러움" },
					{ tag: "연습 권장", text: "기쁨↔슬픔 표정 전환" },
				],
				coach: { name: "김민수", title: "연기 입시반" },
				expiresAt: "2026.06.08",
				contact: "02-XXX-XXXX",
			}
		: null;

	if (!data) {
		return (
			<main className="flex-1 flex items-center justify-center px-4 py-16">
				<div className="max-w-md text-center space-y-3">
					<h1 className="text-xl font-bold">링크가 만료되었거나 올바르지 않습니다</h1>
					<p className="text-sm text-muted-foreground">
						학원에 문의해 주세요. 평가 결과는 30일 동안 열람 가능합니다.
					</p>
				</div>
			</main>
		);
	}

	const obsBg: Record<string, string> = {
		발전: "bg-emerald-50 text-emerald-800",
		유지: "bg-amber-50 text-amber-800",
		"연습 권장": "bg-orange-50 text-orange-800",
	};

	return (
		<main className="max-w-screen-sm mx-auto px-4 py-6 pb-16">
			<div className="text-center mb-5">
				<div className="text-xs uppercase tracking-widest text-muted-foreground">
					{data.academyName}
				</div>
			</div>

			<section className="rounded-xl border bg-card p-5 mb-3">
				<h1 className="text-xl font-bold mb-1">{data.studentName} 학생</h1>
				<p className="text-sm text-muted-foreground mb-4">{data.evaluationDate}</p>
				<div className="flex items-baseline pt-3 border-t">
					<span className="text-xs text-muted-foreground font-medium">종합 의견</span>
					<span className="ml-auto text-sm font-semibold">{data.summary}</span>
				</div>
			</section>

			<section className="rounded-xl border bg-card p-5 mb-3">
				<div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
					코치 피드백
				</div>
				<div className="text-base leading-relaxed whitespace-pre-line">
					{data.feedback}
				</div>

				<div className="mt-5 pt-4 border-t">
					<div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
						세부 관찰
					</div>
					<div className="space-y-2">
						{data.observations.map((obs) => (
							<div key={obs.tag} className="flex items-start gap-2.5 text-sm">
								<span
									className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${obsBg[obs.tag] ?? "bg-muted text-muted-foreground"}`}
								>
									{obs.tag}
								</span>
								<span className="leading-snug">{obs.text}</span>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="rounded-xl border bg-card p-4 mb-6 flex items-center gap-3">
				<div className="size-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold">
					{data.coach.name[0]}
				</div>
				<div>
					<div className="font-semibold text-sm">{data.coach.name} 코치</div>
					<div className="text-xs text-muted-foreground">{data.coach.title}</div>
				</div>
			</section>

			<footer className="text-center text-xs text-muted-foreground space-y-1 px-3">
				<p>문의: {data.academyName} · {data.contact}</p>
				<p>
					{data.expiresAt}까지 열람 가능 ·{" "}
					<a href="#" className="underline">개인정보 처리 안내</a>
				</p>
			</footer>
		</main>
	);
}
