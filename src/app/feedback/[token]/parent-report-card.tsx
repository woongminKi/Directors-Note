type Feedback = {
	coach_edited_text: string;
	student_name: string;
	academy_name: string;
	coach_display_name: string;
	evaluation_date: string;
};

export function ParentReportCard({ feedback }: { feedback: Feedback }) {
	return (
		<main className="min-h-screen bg-muted/30 px-4 py-8">
			<div className="max-w-md mx-auto space-y-4">
				<header className="text-center">
					<h1 className="text-lg font-bold">{feedback.academy_name}</h1>
				</header>

				<div className="rounded-lg bg-background p-4 shadow-sm">
					<p className="text-xs text-muted-foreground">평가일</p>
					<p className="font-semibold">{feedback.evaluation_date}</p>
					<p className="text-xs text-muted-foreground mt-3">학생</p>
					<p className="font-semibold">{feedback.student_name}</p>
				</div>

				<div className="rounded-lg bg-background p-4 shadow-sm">
					<p className="text-xs text-muted-foreground mb-2">코치 피드백</p>
					<div className="whitespace-pre-line text-base leading-relaxed">
						{feedback.coach_edited_text}
					</div>
				</div>

				<div className="rounded-lg bg-background p-4 shadow-sm text-sm">
					<p className="text-muted-foreground">작성</p>
					<p className="font-medium">{feedback.coach_display_name} 드림</p>
				</div>

				<footer className="text-center text-xs text-muted-foreground space-y-1 pt-4">
					<p>이 링크는 발송 후 30일 동안만 열람 가능합니다.</p>
					<p>
						<a href="/privacy" className="underline">
							개인정보처리방침
						</a>
					</p>
				</footer>
			</div>
		</main>
	);
}
