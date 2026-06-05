# Consumer Payment (KakaoPay, pay-to-unlock) — Design Spec

**Date:** 2026-06-05
**Scope:** D-③ 선행 토대 = **소비자 실결제(카카오페이)**. 평가자 정산·환불은 후속(인터페이스 자리만).
**Status:** Approved (design), pre-implementation

## 1. 목적

소비자 결제는 현재 stub(`submissions.paid_at` 타임스탬프 1개, 금액·거래 기록 없음)이다. 정산·환불은
"돈이 실제로 들어오고 금액/거래가 기록되는" 토대가 있어야 얹힌다. 이 작업은 **카카오페이 단건결제**로
실결제 경로를 만들고(주문/거래 모델 + provider 추상화), `pay-to-unlock` 모델(채점 후 결제→결과 공개)을
유지한다. 실거래 go-live 는 사업자·가맹계약·PIPA 선행(코드 밖). sandbox(`TC0ONETIME`)로 구현·검증.

## 2. 범위

**이번 사이클:**
- `payment_orders` 주문/거래 테이블 + RLS
- `PaymentProvider` 추상화 + `KakaoPayProvider`(sandbox) + `StubProvider`(무료 파일럿 보존) + factory
- `payReady` / `payApprove` 서버 흐름 + 카카오페이 리다이렉트 콜백 라우트
- 결제 승인 → `submissions.paid_at` 스탬프 → `releaseSubmission()` (기존 게이트 재사용)
- 가격: 기본 ₩9,900, 주문 레코드에 금액 저장, config(상수/env)로 변경

**비범위 (후속):**
- 평가자 정산(원장 적립 → 송금, 3.3% 원천징수, 지급명세서)
- 환불(KakaoPay cancel) — 단 `PaymentProvider`에 `cancel()` 자리만 남김
- 실거래 go-live(사업자 등록·카카오페이 가맹계약·PIPA 자문)

## 3. 재사용 / 신규 / 비범위

**재사용:**
- `submissions.paid_at`(unlock 신호) + `releaseSubmission()`(scored+paid 게이트, release-action.ts) 그대로
- factory + feature-flag 패턴(evaluation/notifications 동형)
- `requireConsumer`, 직결 `db`(시스템 쓰기), `getCurrentUser`
- 기존 `payForSubmission`(stub 즉시 스탬프)은 `FEATURE_PAYMENT_ENABLED=false` 무료 파일럿 경로로 보존

**신규:** 4·5·6절.

## 4. 플로우 (카카오페이 단건결제 — 리다이렉트)

```
[scored 상태 소비자] "결제하기"
  → payReady(submissionId) (server action)
      · 본인·scored·미결제 검증, amount = config(₩9,900)
      · payment_orders insert(status=ready, amount, partner_order_id=order.id)
      · KakaoPay ready API → tid + next_redirect_url 수신, order.provider_tid 저장
      · next_redirect_url 반환 → 클라가 리다이렉트
  → 사용자 카카오페이 승인
  → GET /api/payments/kakao/approve?order=<id>&pg_token=<...>  (approval_url 콜백)
      · 주문 로드·검증, KakaoPay approve API(tid, pg_token)
      · 성공: order.status=approved, approved_at; submissions.paid_at 스탬프; releaseSubmission()
      · 결과 페이지로 리다이렉트(/submissions/[id])
  → 실패/취소: cancel_url/fail_url 콜백 → order.status=canceled|failed → 안내 페이지
```

## 5. DB (마이그레이션 0020 테이블 + 0021 RLS)

**`payment_orders`:**
- `id uuid PK, submission_id uuid FK→submissions(cascade), user_id uuid FK→users(restrict), amount integer NOT NULL(원), provider text NOT NULL CHECK(provider IN ('kakaopay','stub')), provider_tid text, status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','approved','canceled','failed')), approved_at timestamptz, created_at timestamptz`
- index: `(submission_id)`, `(status)`
- RLS: 본인(`user_id = auth.uid()`) SELECT 만. write 는 시스템(service-role/직결 db).

`submissions.paid_at` 스키마 변경 없음(승인 시 기존 컬럼에 스탬프).

## 6. 추상화 (`src/lib/payments/`)

- `types.ts`
  - `PaymentOrder`(행 형태), `ReadyResult = {ok:true; tid; redirectUrl} | {ok:false; error}`,
    `ApproveResult = {ok:true} | {ok:false; error}`
  - `interface PaymentProvider { ready(order, ctx): Promise<ReadyResult>; approve(order, pgToken): Promise<ApproveResult>; /* cancel() 후속 */ }`
- `kakaopay-provider.ts` — KakaoPay ready/approve 호출(직접 fetch). CID·인증 헤더는 env.
- `stub-provider.ts` — 무료 파일럿. `ready()`: 외부 결제창 없이 주문을 바로 `approved` 로 만들고
  `redirectUrl = /submissions/[id]`(결과 페이지) 반환. `approve()`: no-op `{ok:true}`(이미 approved).
  즉 stub 모드 payReady 가 곧바로 paid_at 스탬프+release 까지 수행 → 기존 즉시 스탬프 동작과 동치.
- `factory.ts` — `createPaymentProvider()`: `FEATURE_PAYMENT_ENABLED==='true' && KAKAO_PAY_*` 있으면 KakaoPay, 아니면 Stub.
- `actions.ts` — `payReady(submissionId)`, `approveOrder(orderId, pgToken)`(콜백 라우트가 호출), 검증·상태전이·스탬프·release.
- 콜백 라우트: `src/app/api/payments/kakao/approve/route.ts`(GET), 필요 시 `cancel`·`fail`.

## 7. env

신규: `KAKAO_PAY_SECRET_KEY`(optional), `KAKAO_PAY_CID`(optional, 기본 테스트 `TC0ONETIME`).
기존 `FEATURE_PAYMENT_ENABLED`(true=카카오페이, false=stub) 재사용. 가격 상수
`SUBMISSION_PRICE_KRW=9900`(config 상수; 후속에 env 승격 가능).

## 8. 보안 / 멱등 / 에러

- **금액은 서버 config 로만 결정** — 클라이언트가 보낸 금액 신뢰 금지.
- 주문 생성·승인 시 **본인 제출(uploader=auth user) + soft-delete 제외** 검증.
- approve **멱등**: 이미 `approved` 주문이면 재승인 no-op(중복 콜백 안전). paid_at 스탬프도 기존 멱등 로직.
- approve 성공 **이후에만** release.
- KakaoPay API 실패/타임아웃 → order `failed` + 사용자 안내. release 는 호출 안 함.
- 콜백 라우트는 `/api/payments/*` — proxy 미들웨어 인증 대상. 소비자 세션으로 접근하므로 `isPublic`
  추가 불필요(로그인 상태). 단 결제 콜백이 세션 쿠키 없이 올 가능성 검토 — KakaoPay 리다이렉트는
  같은 브라우저 세션이므로 쿠키 유지됨. (cron 과 달리 인증 우회 불필요.)

## 9. 테스트

- 단위: factory 선택(flag/env), 금액 config, approve 멱등(이미 approved → no-op), 금액 서버결정.
- 통합(DB-gated): payReady → ready 주문 생성(KakaoPay HTTP 모킹 → tid/redirect), approveOrder →
  approved + submissions.paid_at 스탬프 + release(scored 전제). 실패 응답 → failed. 본인 아닌 주문 차단.
- KakaoPay 실 HTTP 는 모킹(네트워크). sandbox 실호출은 수동/E2E.

## 10. 사이드 이펙트 점검

- `submissions`/`release`/기존 stub 경로 비침습 — `FEATURE_PAYMENT_ENABLED=false` 면 기존 동작 그대로.
- 신규 테이블·RLS 는 격리. proxy 미들웨어는 결제 콜백을 막지 않음(로그인 세션 유지).
- KakaoPay API 개편 가능성 → ready/approve 엔드포인트·인증·CID 는 **구현 시 공식 문서로 확정**
  (provider 뒤 캡슐화). DB-gated 통합테스트는 `--no-file-parallelism` 직렬 실행.

## 11. 후속 (이 토대 위에 얹힘)

- **환불**: `PaymentProvider.cancel()` 구현 + KakaoPay cancel API + order `canceled` + paid_at 해제/release 취소 정책.
- **평가자 정산**: `evaluator_earnings` 원장(채점 건당 적립, 금액 = 주문 amount 기반 분배) → 지급(송금,
  3.3% 원천징수, 지급명세서). 별도 사이클.
