// WS4 — 평가자 선택 로직 (순수 함수, DB 무관 → Vitest 단위 테스트 가능).
//
// 자격 풀(eligible pool)은 호출부(actions.ts)에서 이미 다음으로 필터링되어 들어온다:
//   role='evaluator' AND evaluator_status='active' AND onboarded_at IS NOT NULL.
// 이 함수는 "그 풀 중 누구에게 배정할지"만 결정한다.
//
// 전략: 오픈 배정(status='assigned') 최소 평가자 → 부하 분산(라운드로빈 근사).
// Tie-break: onboardedAt 오래된 순 (가장 먼저 온보딩한 평가자 우선) — 결정적이고
//   테스트 가능. onboardedAt 동률이면 evaluatorId 사전순으로 최종 결정 (완전 결정적).
//
// 명세 WS4: "전략=오픈 배정 최소 평가자, tie=assigned_at 오래된 순".
//   assigned_at 은 배정 시점마다 달라져 입력으로 받기 까다롭고, "가장 오래 기다린
//   평가자" 의도는 온보딩 순서(onboardedAt)로 결정적으로 근사할 수 있어 이를 채택.
//   (오픈 배정이 0인 신규 평가자에겐 assigned_at 자체가 없으므로 onboardedAt 가 더 안정적.)

export type EvaluatorCandidate = {
	evaluatorId: string;
	// 온보딩 통과 시각. 풀 진입 조건상 non-null 이지만 방어적으로 null 허용.
	onboardedAt: Date | null;
};

// evaluatorId → 현재 오픈(status='assigned') 배정 수.
export type OpenAssignmentCounts = Record<string, number>;

/**
 * 자격 풀에서 다음 배정 대상 평가자 1명을 결정적으로 선택한다.
 * @param candidates 자격 필터를 통과한 평가자 목록
 * @param openCounts evaluatorId → 오픈 배정 수 (없으면 0으로 간주)
 * @param exclude   제외할 evaluatorId 집합 (재배정 시 타임아웃 평가자, 이중라벨 시 primary 평가자)
 * @returns 선택된 evaluatorId, 풀이 비면 null
 */
export function selectEvaluator(
	candidates: EvaluatorCandidate[],
	openCounts: OpenAssignmentCounts,
	exclude: ReadonlySet<string> = new Set(),
): string | null {
	const pool = candidates.filter((c) => !exclude.has(c.evaluatorId));
	if (pool.length === 0) return null;

	let best: EvaluatorCandidate | null = null;
	let bestOpen = Number.POSITIVE_INFINITY;

	for (const c of pool) {
		const open = openCounts[c.evaluatorId] ?? 0;
		if (open < bestOpen) {
			best = c;
			bestOpen = open;
			continue;
		}
		if (open === bestOpen && best) {
			// Tie-break 1: onboardedAt 오래된 순 (null 은 가장 마지막으로 취급).
			const cTime = c.onboardedAt?.getTime() ?? Number.POSITIVE_INFINITY;
			const bestTime = best.onboardedAt?.getTime() ?? Number.POSITIVE_INFINITY;
			if (cTime < bestTime) {
				best = c;
			} else if (cTime === bestTime && c.evaluatorId < best.evaluatorId) {
				// Tie-break 2: evaluatorId 사전순 (완전 결정적).
				best = c;
			}
		}
	}

	return best?.evaluatorId ?? null;
}

/**
 * 이중라벨 배정 여부 결정 (순수, rng 주입으로 결정적 테스트 가능).
 * @param rate 0~1 확률
 * @param rng  () => [0,1) 난수. 기본 Math.random. rng() < rate 이면 true.
 */
export function shouldCreateRedundantLabel(
	rate: number,
	rng: () => number = Math.random,
): boolean {
	return rng() < rate;
}
