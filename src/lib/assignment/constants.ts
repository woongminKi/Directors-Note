// WS4 — 라우팅/배정 상수.
// 둘 다 제품 결정 항목 (명세 BLOCKING 미결 #6 — SLA 값 + 이중라벨 비율).
// 값은 잠정. 평가자 풀/온보딩 기준 확정 후 재조정 (PRODUCT-TUNABLE).

// 배정 SLA — due_at = now() + 이 시간. 초과 시 expireOverdueAssignments 가 재배정.
// PRODUCT-TUNABLE.
export const ASSIGNMENT_SLA_HOURS = 48;

// QA 이중라벨(redundant double-label) 샘플링 확률.
// 이 확률로 primary 와 다른 평가자에게 is_redundant_label=true 2차 배정을 추가로 만든다.
// inter-rater agreement 데이터 피드용. primary release 를 막지 않는다.
// PRODUCT-TUNABLE.
export const REDUNDANT_LABEL_RATE = 0.15;
