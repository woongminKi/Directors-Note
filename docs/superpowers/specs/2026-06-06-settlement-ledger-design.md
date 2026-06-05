# Settlement Ledger (evaluator earnings accrual) — Design Spec

**Date:** 2026-06-06
**Scope:** D-③ (b) 정산 **적립(ledger)만**. 지급(c)·UI는 비범위/차단.
**Status:** Approved (design), pre-implementation

## 1. 목적

평가자가 채점을 완료하고 소비자가 결제해 결과가 공개(released)되면, 평가자에게 **수익을 적립**한다.
실제 송금(disbursement)은 사업자·세무(3.3% 원천징수)·PIPA(주민번호)·정산대행 선행이 필요해 (c)로
차단. 이번 사이클은 "누가 얼마를 받을지" 원장만 만든다(순수 데이터). 환불(이미 구현된 (a)) 시 적립을 void.

## 2. 범위

**이번 사이클:**
- `evaluator_earnings` 테이블(0023) + RLS(0024)
- `accrueEarning` (release 시 primary 평가자에게 ₩6,000 적립, 멱등)
- `voidEarningsForSubmission` (refund 시 pending 적립 void)
- `listEarnings(evaluatorUserId)` (조회 — 후속 UI/관리자용)
- config `EVALUATOR_FEE_KRW = 6000`
- 훅: release-action(적립), payments/actions refundOrder(void) — 둘 다 실패 격리

**비범위:** 지급/송금·3.3% 원천징수·지급명세서·평가자 계좌/주민번호 수집(=c, 차단), 수익 대시보드 UI,
정산 주기/명세, 부분 정산, QA(redundant) 라벨 적립(primary만 적립).

## 3. 재사용 / 신규

**재사용:** `labeled_results`(release 시 `is_primary=true` 셋 — 적립 트리거 앵커), `releaseSubmission`(트리거),
`refundOrder`(payments/actions.ts — void 훅), 직결 `db`, factory/feature 패턴.

**신규:** 4·5·6절.

## 4. 적립/소멸 흐름

```
release (status scored→released, primary 라벨 is_primary=true)
  → accrueEarning({ submissionId, evaluatorUserId: <primary 라벨 평가자>, paymentOrderId? })
      · evaluator_earnings insert(amount=EVALUATOR_FEE_KRW, status='pending')
      · onConflictDoNothing(UNIQUE(submission_id, evaluator_user_id)) → 멱등
      · 실패해도 release 성공 유지(try/catch + console.error)

refundOrder (환불 (a))
  → 기존 동작(주문 canceled + 재잠금) 다음:
  → voidEarningsForSubmission(submissionId)
      · UPDATE evaluator_earnings SET status='void', voided_at=now()
        WHERE submission_id=? AND status='pending'
      · 실패해도 환불 성공 유지(try/catch + console.error)
```

## 5. DB (마이그레이션 0023 + RLS 0024)

**`evaluator_earnings`:**
- `id uuid PK, evaluator_user_id uuid FK→users(restrict), submission_id uuid FK→submissions(cascade),
  payment_order_id uuid FK→payment_orders(set null, nullable; audit), amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','void','paid')),
  created_at timestamptz NOT NULL DEFAULT now(), voided_at timestamptz`
- `UNIQUE(submission_id, evaluator_user_id)` (멱등 적립 — primary 1건/제출)
- index `(evaluator_user_id, status)`
- `paid`는 forward-compat(지급=(c)에서 사용, 이번엔 미사용).

**RLS(0024):** 평가자 본인 적립만 SELECT(`evaluator_user_id = auth.uid()`). write는 시스템(service-role/직결 db).

## 6. 모듈 (`src/lib/settlement/`)

- `config.ts` — `export const EVALUATOR_FEE_KRW = 6000;`
- `actions.ts` (server-only):
  - `accrueEarning(input: { submissionId; evaluatorUserId; paymentOrderId?: string|null }): Promise<void>`
    — insert pending earning(amount=EVALUATOR_FEE_KRW), onConflictDoNothing.
  - `voidEarningsForSubmission(submissionId: string): Promise<void>` — pending→void(voided_at).
  - `listEarnings(evaluatorUserId: string): Promise<EarningRow[]>` — 본인/관리자 조회(직결 db).

## 7. 훅 연결

- `src/lib/submissions/release-action.ts`: `primaryLabel` 조회 컬럼을 `{ id, evaluatorUserId }`로 확장.
  try/catch 블록(release tx) 다음, 성공 반환 직전에 `accrueEarning` 호출(primary 라벨이 있을 때만).
  실패 격리(try/catch + 로그) — release 결과 불변. (`alreadyReleased` no-op 경로는 적립 호출 안 함;
  멱등이라 호출돼도 무방하나 정확히 신규 release 시에만.)
- `src/lib/payments/actions.ts` `refundOrder`: 재잠금 업데이트 다음, `return { ok:true }` 직전에
  `voidEarningsForSubmission(order.submissionId)` 호출(실패 격리).

## 8. 멱등 / 보안 / 에러

- 적립 멱등: `UNIQUE(submission_id, evaluator_user_id)` + onConflictDoNothing. release 멱등과 정합.
- void: `status='pending'` 행만(이미 void/paid면 no-op). 멱등.
- 금액 서버 config(₩6,000), 행에 스냅샷.
- accrue/void 실패는 각각 release/refund를 깨지 않음(부가 기능) — try/catch + console.error.

## 9. 테스트

- 단위: config 값(6000). 
- 통합(DB-gated, 직렬):
  - `accrueEarning` → pending 행 1개(amount 6000); 재호출 멱등(중복 행 X).
  - `voidEarningsForSubmission` → pending→void(voided_at 셋); void된 건 재void no-op.
  - release 훅: 결제·release된 submission → primary 평가자 earning pending 1행.
  - refund 훅: 환불 → 해당 earning void.
  - (회귀) 기존 release/payment/refund 통합 테스트 유지.

## 10. 사이드 이펙트 점검

- accrue/void는 핵심 플로우(release/refund) **밖에서 실패 격리** 호출 → 기존 동작/테스트 회귀 없음.
- 신규 테이블·RLS 격리. 0023/0024 순차. schema.ts ↔ 마이그레이션 일치.
- DB-gated 테스트 `--no-file-parallelism` 직렬.
- 지급(c) 미구현 → `status='paid'` 전이는 이번에 발생 안 함(원장은 pending/void만).

## 11. 후속

- **(c) 지급**: 평가자 계좌/주민번호 수집(PIPA 동의·암호화) → pending earnings 집계 → 송금(정산대행) +
  3.3% 원천징수 + 지급명세서 → `status='paid', paid_at`. 사업자·세무·정산대행 선행.
- 평가자 수익 대시보드(listEarnings 사용), 정산 명세서.
