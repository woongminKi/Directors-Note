import type {
	AIAnalysis,
	AxisScores,
	PartAnalysis,
	PartIndex,
	ReferenceMatch,
} from "./types";

// 3파트 분할 임베딩 기반 등급 도출.
//
// 영상 구조 (도메인):
//   part 1 (0-90s):    자유 연기 → expression (표정·표현)
//   part 2 (90-150s):  무용 또는 노래 → vocal (발성)
//   part 3 (150s~):    압박 면접 → examReadiness (입시 완성도)
//
// 각 part 의 top-1 reference 매칭의 tier base + cosine jitter 로 점수 산출.
// 3개 축 점수 평균을 내서 final internalGrade 결정.
//
// Tier base: A=8.0, B=6.5, C=5.0, D=3.5
// Tier 경계 (평균 기준, midpoint): A≥7.25, B≥5.75, C≥4.25, else D

const TIER_BASE: Record<"A" | "B" | "C" | "D", number> = {
	A: 8.0,
	B: 6.5,
	C: 5.0,
	D: 3.5,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export type PartMatchesByPart = Record<PartIndex, ReferenceMatch[]>;

export function scorePartFromTopMatch(top: ReferenceMatch): number {
	const base = TIER_BASE[top.tier];
	// cosine 0.5 가 중립; 0.5 위로 +1.5, 아래로 -1.5
	const jitter = (top.cosineScore - 0.5) * 3;
	return Math.max(0, Math.min(10, base + jitter));
}

export function deriveGradeFromScores(scores: number[]): "A" | "B" | "C" | "D" {
	if (scores.length === 0) {
		throw new Error("derive_grade_empty_scores");
	}
	const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
	if (avg >= 7.25) return "A";
	if (avg >= 5.75) return "B";
	if (avg >= 4.25) return "C";
	return "D";
}

export function deriveAxesFromPartMatches(
	partMatches: PartMatchesByPart,
): AxisScores {
	const part1Top = partMatches[1][0];
	const part2Top = partMatches[2][0];
	const part3Top = partMatches[3][0];
	if (!part1Top || !part2Top || !part3Top) {
		throw new Error("no_reference_matches");
	}
	return {
		expression: round1(scorePartFromTopMatch(part1Top)),
		vocal: round1(scorePartFromTopMatch(part2Top)),
		examReadiness: round1(scorePartFromTopMatch(part3Top)),
	};
}

// Cosine 신뢰도가 낮으면 (any part top1 < 0.70 또는 gap < 0.05) llm_as_judge 로
// escalate — D12. v1 에선 escalation 미구현, 항상 cosine path.
export function shouldEscalateToJudge(matches: ReferenceMatch[]): boolean {
	const top1 = matches[0]?.cosineScore ?? 0;
	const top2 = matches[1]?.cosineScore ?? 0;
	return top1 < 0.7 || top1 - top2 < 0.05;
}

export function buildAnalysisFromPartMatches(
	partMatches: PartMatchesByPart,
	rawResponseJson: unknown,
): AIAnalysis {
	const part1Top = partMatches[1][0];
	const part2Top = partMatches[2][0];
	const part3Top = partMatches[3][0];
	if (!part1Top || !part2Top || !part3Top) {
		throw new Error(
			"no_reference_matches — academy is missing reference embeddings for one or more parts; seed reference set first",
		);
	}

	const axes = deriveAxesFromPartMatches(partMatches);
	const internalGrade = deriveGradeFromScores([
		scorePartFromTopMatch(part1Top),
		scorePartFromTopMatch(part2Top),
		scorePartFromTopMatch(part3Top),
	]);

	const meanTop1Cos =
		(part1Top.cosineScore + part2Top.cosineScore + part3Top.cosineScore) / 3;
	const minTop1Cos = Math.min(
		part1Top.cosineScore,
		part2Top.cosineScore,
		part3Top.cosineScore,
	);

	const perPartAnalysis: PartAnalysis[] = ([1, 2, 3] as PartIndex[]).map(
		(p) => {
			const top = partMatches[p][0];
			if (!top) throw new Error("no_reference_matches");
			return {
				partIndex: p,
				topMatch: top,
				score: round1(scorePartFromTopMatch(top)),
				matches: partMatches[p].slice(0, 5),
			};
		},
	);

	const allMatches = [
		...partMatches[1],
		...partMatches[2],
		...partMatches[3],
	].sort((a, b) => b.cosineScore - a.cosineScore);

	const topMatches = allMatches.slice(0, 5);

	return {
		axes,
		internalGrade,
		calibrationMatchScore: meanTop1Cos,
		evaluatorUsed: "cosine",
		cosineConfidence: minTop1Cos,
		topMatches,
		perPartAnalysis,
		// Embed derived data inside rawResponseJson so the coach UI (which only
		// reads from rawResponseJson) can show topMatches + per-part breakdown.
		rawResponseJson: {
			metadata: rawResponseJson,
			topMatches,
			perPartAnalysis,
		},
	};
}
