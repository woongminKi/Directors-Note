import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// Shape of the ai_analyses row (drizzle returns numerics as string | null).
type AnalysisRow = {
	vocalScore: string | null;
	expressionScore: string | null;
	examReadinessScore: string | null;
	internalGrade: string;
	calibrationMatchScore: string | null;
	evaluatorUsed: string;
	cosineConfidence: string | null;
	rawResponseJson: unknown;
};

type Match = {
	referenceVideoId?: string;
	tier: string;
	sceneType: string;
	cosineScore: number;
	partIndex?: 1 | 2 | 3;
};

type PartAnalysis = {
	partIndex: 1 | 2 | 3;
	topMatch: Match;
	score: number;
};

const AXES = [
	{ key: "vocalScore", label: "발성", partIndex: 2 as const },
	{ key: "expressionScore", label: "표정", partIndex: 1 as const },
	{ key: "examReadinessScore", label: "입시 완성도", partIndex: 3 as const },
] as const;

const PART_LABEL: Record<1 | 2 | 3, string> = {
	1: "자유 연기 (0-90s)",
	2: "무용·노래 (90-150s)",
	3: "압박 면접 (150s~)",
};

const GRADE_STYLE: Record<string, string> = {
	A: "bg-green-600 text-white",
	B: "bg-blue-600 text-white",
	C: "bg-amber-500 text-white",
	D: "bg-rose-600 text-white",
};

function topMatches(raw: unknown): Match[] {
	if (raw && typeof raw === "object" && "topMatches" in raw) {
		const m = (raw as { topMatches?: unknown }).topMatches;
		if (Array.isArray(m)) {
			return m.filter(
				(x): x is Match =>
					!!x &&
					typeof x === "object" &&
					"tier" in x &&
					"sceneType" in x &&
					"cosineScore" in x,
			);
		}
	}
	return [];
}

function perPartAnalysis(raw: unknown): PartAnalysis[] {
	if (raw && typeof raw === "object" && "perPartAnalysis" in raw) {
		const p = (raw as { perPartAnalysis?: unknown }).perPartAnalysis;
		if (Array.isArray(p)) {
			return p.filter(
				(x): x is PartAnalysis =>
					!!x &&
					typeof x === "object" &&
					"partIndex" in x &&
					"topMatch" in x &&
					"score" in x,
			);
		}
	}
	return [];
}

const pct = (v: string | null) =>
	v != null ? `${Math.round(Number(v) * 100)}%` : null;

export function AnalysisResult({ analysis }: { analysis: AnalysisRow }) {
	const matches = topMatches(analysis.rawResponseJson);
	const parts = perPartAnalysis(analysis.rawResponseJson);
	const evaluatorLabel =
		analysis.evaluatorUsed === "cosine" ? "코사인 매칭" : "LLM 심사";
	const calibration = pct(analysis.calibrationMatchScore);
	const confidence = pct(analysis.cosineConfidence);

	return (
		<section className="rounded-lg border bg-card p-4 space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold">AI 분석 결과</h2>
				<Badge className={GRADE_STYLE[analysis.internalGrade] ?? "bg-muted"}>
					내부 등급 {analysis.internalGrade}
				</Badge>
			</div>

			<div className="space-y-2">
				{AXES.map((ax) => {
					const raw = analysis[ax.key];
					const n = raw != null ? Number(raw) : null;
					return (
						<div key={ax.key} className="space-y-1">
							<div className="flex justify-between text-xs">
								<span className="text-muted-foreground">{ax.label}</span>
								<span className="font-medium">
									{n != null ? n.toFixed(1) : "—"} / 10
								</span>
							</div>
							<Progress value={n != null ? n * 10 : 0} className="h-1.5" />
						</div>
					);
				})}
			</div>

			<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<span>평가 방식: {evaluatorLabel}</span>
				{calibration && <span>캘리브레이션 매칭: {calibration}</span>}
				{confidence && <span>코사인 신뢰도: {confidence}</span>}
			</div>

			{parts.length > 0 && (
				<div className="space-y-1">
					<p className="text-xs font-medium">파트별 매칭</p>
					<ul className="space-y-1">
						{parts.map((p) => (
							<li key={p.partIndex} className="flex justify-between text-xs">
								<span>
									{PART_LABEL[p.partIndex]} · {p.topMatch.tier}급
								</span>
								<span className="text-muted-foreground">
									{p.score.toFixed(1)}/10 · cos{" "}
									{Math.round(p.topMatch.cosineScore * 100)}%
								</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{matches.length > 0 && (
				<div className="space-y-1">
					<p className="text-xs font-medium">상위 매칭 (전체)</p>
					<ul className="space-y-1">
						{matches.slice(0, 5).map((m) => (
							<li
								key={`${m.referenceVideoId ?? `${m.tier}-${m.sceneType}`}-${m.partIndex ?? "x"}-${m.cosineScore}`}
								className="flex justify-between text-xs"
							>
								<span>
									{m.tier}급{m.partIndex ? ` · part${m.partIndex}` : ""} ·{" "}
									{m.sceneType}
								</span>
								<span className="text-muted-foreground">
									{Math.round(m.cosineScore * 100)}%
								</span>
							</li>
						))}
					</ul>
				</div>
			)}

			<p className="text-[11px] text-muted-foreground border-t pt-2">
				🔒 코치 전용 · 부모에게 노출되지 않습니다
			</p>
		</section>
	);
}
