# Refund (Admin full refund, re-lock) — Design Spec

**Date:** 2026-06-05
**Scope:** D-③ (a) 환불. 정산 원장(b)·지급/원천징수(c)는 별도 사이클.
**Status:** Approved (design), pre-implementation

## 1. 목적

소비자 결제(카카오페이) 토대 위에 **관리자(CS) 전액 환불**을 추가한다. pay-to-unlock 모델이라
소비자 셀프 환불은 비범위(이미 본 디지털 결과물 악용 방지). 환불 시 결과 접근을 **재잠금**한다
(paid_at 해제 + released→scored). sandbox(`TC0ONETIME`)로 검증, 실거래는 결제와 동일하게 가맹계약 후.

## 2. 범위

**이번 사이클:**
- `PaymentProvider.cancel(order)` + `KakaoPayProvider.cancel`(KakaoPay /cancel) + `StubProvider.cancel`
- `refundOrder(orderId)` 서버 액션 (admin 인가): approved 주문 → cancel → canceled + 재잠금
- 마이그레이션 0022: `payment_orders.canceled_at` 추가
- 재잠금: `submissions.paid_at=NULL` + `status released→scored`
- 관리자 트리거 UI: 기존 admin 영역 유무에 따라 버튼 or 액션만(소비자 노출 없음)

**비범위:** 부분 환불, 소비자 셀프 환불, 정산 clawback((b) 미구현 — N/A), 환불 알림.

## 3. 재사용 / 신규

**재사용:** `payment_orders`(status enum에 `canceled` 이미 존재), `KakaoPayProvider`/`StubProvider`/factory,
`PaymentProvider` 인터페이스, `getCurrentUser`(admin 인가 — release-action.ts의 `role==='admin'` 패턴),
직결 `db`(시스템 쓰기). 기존 `KAKAO_PAY_*` env.

**신규:** `cancel()` 메서드, `refundOrder` 액션, 0022 마이그레이션(canceled_at), admin 트리거.

## 4. 플로우

```
관리자 → refundOrder(orderId)
  · getCurrentUser, role==='admin' 아니면 forbidden
  · order 로드. 없으면 not_found.
  · status==='canceled' → 멱등 ok(이미 환불).
  · status!=='approved' → not_refundable (ready/failed).
  · provider.cancel(order)
      실패 → 주문 approved 유지, return { ok:false, error:'cancel_failed' }
      성공 → 한 묶음 업데이트:
        payment_orders: status='canceled', canceled_at=now()
        submissions: paid_at=NULL, updated_at=now();
                     status='scored' WHERE status='released' (재잠금, 멱등)
  · return { ok:true }
```

## 5. DB (마이그레이션 0022)

`payment_orders`에 `canceled_at timestamptz` 컬럼 추가(audit). status enum 변경 없음(`canceled` 기존).
schema.ts의 `paymentOrders`에 `canceledAt: timestamp("canceled_at", { withTimezone: true })` 추가.

## 6. 추상화 확장 (`src/lib/payments/`)

- `types.ts`: `CancelResult = { ok:true } | { ok:false; error:string }`; `PaymentProvider`에
  `cancel(order: PaymentOrderRow): Promise<CancelResult>` 추가.
- `kakaopay-provider.ts`: `cancel` — POST `${BASE}/cancel` (cid, tid=order.providerTid, cancel_amount=order.amount,
  cancel_tax_free_amount:0). providerTid 없으면 missing_tid. non-2xx → cancel_http_<status>.
- `stub-provider.ts`: `cancel` → `{ ok:true }`.
- `actions.ts`(기존 payments/actions.ts에 추가): `refundOrder(orderId)`.

## 7. 인가 / 멱등 / 보안

- **admin 전용**. 소비자/평가자 호출 차단(role 검사). 소비자 UI 없음.
- 환불 가능 상태 = `approved`만. `canceled`는 멱등 ok, 그 외 not_refundable.
- 재잠금은 `released`→`scored` (멱등; 이미 scored면 no-op). is_primary 미변경(status=scored가 RLS 차단).
- cancel 실패 시 상태 불변(approved 유지) — 부분 적용 방지.

## 8. 테스트

- 단위: `KakaoPayProvider.cancel`(fetch 모킹: 성공 ok / HTTP오류 ok:false / providerTid 없음 missing_tid),
  `StubProvider.cancel` ok. factory 영향 없음.
- 통합(DB-gated, 직렬): approved 주문(+released submission) → refundOrder → order canceled+canceled_at,
  submissions paid_at NULL + status scored. 비-approved(ready) → not_refundable. 멱등(두 번째 ok). admin 아닌 role → forbidden.

## 9. 사이드 이펙트 점검

- 결제 흐름(payReady/approveOrder) 비침습 — `cancel`/`refundOrder`만 추가. 기존 결제 테스트 회귀 없음.
- 0022는 컬럼 1개 추가(기존 데이터 무영향). dev=prod 동일 ref라 적용 시 양쪽 반영.
- 카카오페이 cancel 엔드포인트·인증·파라미터는 구현 시 공식 문서로 확정(provider 캡슐화, 테스트는 fetch 모킹).
- DB-gated 테스트 `--no-file-parallelism` 직렬.

## 10. 후속

- (b) 정산 원장 구현 시: 환불된 주문에 연결된 평가자 적립을 **clawback/void** 처리(이번엔 (b)가 없어 N/A).
- 부분 환불, 환불 사유 코드, 소비자/평가자 환불 알림(웹푸시 토대 재사용).
- 실거래 go-live: 결제와 동일(사업자·가맹계약·PIPA).
