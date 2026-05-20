import type { AIAnalysis, AxisScores, ReferenceMatch } from "./types";

// V1 휴리스틱: top-match cosine 값에서 internal_grade + axes 도출.
// 한 개의 영상 embedding 으로 vocal/expression/examReadiness 를 따로 측정할 수
// 없음 — 같은 점수로 broadcast. v2 에서 axis-별 reference embedding 시드로
// 분리 측정 (TODO).
//
// Tier base: A=8.0, B=6.5, C=5.0, D=3.5
// cosine_similarity 0.0~1.0 을 ±1.5 jitter 로 mapping → axes 점수
// (cosine 낮으면 같은 tier 안에서도 점수 낮음).

const TIER_BASE: Record<"A" | "B" | "C" | "D", number> = {
	A: 8.0,
	B: 6.5,
	C: 5.0,
	D: 3.5,
};

export function deriveAxesFromTopMatch(topMatch: ReferenceMatch): AxisScores {
	const base = TIER_BASE[topMatch.tier];
	// cosine 0.5 가 중립; 0.5 위로 +1.5, 아래로 -1.5
	const jitter = (topMatch.cosineScore - 0.5) * 3;
	const score = Math.max(0, Math.min(10, base + jitter));
	const rounded = Math.round(score * 10) / 10;
	return {
		vocal: rounded,
		expression: rounded,
		examReadiness: rounded,
	};
}

// Cosine 신뢰도가 낮으면 (top1 < 0.70 또는 gap < 0.05) llm_as_judge 로
// escalate — D12. v1 에선 escalation 미구현, 항상 cosine path.
export function shouldEscalateToJudge(matches: ReferenceMatch[]): boolean {
	const top1 = matches[0]?.cosineScore ?? 0;
	const top2 = matches[1]?.cosineScore ?? 0;
	return top1 < 0.7 || top1 - top2 < 0.05;
}

export function buildAnalysisFromMatches(
	matches: ReferenceMatch[],
	rawResponseJson: unknown,
): AIAnalysis {
	if (matches.length === 0) {
		throw new Error(
			"no_reference_matches — academy has no reference_videos with embeddings; seed reference set first",
		);
	}
	const top = matches[0];
	if (!top) throw new Error("no_top_match");
	return {
		axes: deriveAxesFromTopMatch(top),
		internalGrade: top.tier,
		calibrationMatchScore: top.cosineScore,
		evaluatorUsed: "cosine",
		cosineConfidence: top.cosineScore,
		topMatches: matches.slice(0, 5),
		rawResponseJson,
	};
}
