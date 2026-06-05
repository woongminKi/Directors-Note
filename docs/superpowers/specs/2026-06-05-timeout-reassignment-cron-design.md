# Timeout Reassignment Cron — Design Spec

**Date:** 2026-06-05
**Scope:** Phase A 잔여 작업 D-① (타임아웃 재배정 cron 배선)
**Status:** Approved (design), pre-implementation

## 1. 목적

평가자 배정(`evaluation_assignments`)에는 48h SLA(`due_at = assigned_at + 48h`)가 있다.
만료된 배정을 만료 처리하고 재배정하는 sweep 로직은 이미 구현되어 있으나(`src/lib/assignment/actions.ts`),
**스케줄러에 배선되어 있지 않아 admin이 수동 호출해야만 동작**한다.
이 작업은 기존 sweep 함수를 Vercel Cron으로 배선해 자동화한다. 새 비즈니스 로직은 추가하지 않는다.

## 2. 재사용 / 신규 / 비범위

**재사용 (그대로):**
- `expireOverdueAssignments(rng?)` — `status='assigned' AND due_at < now()` 스캔 → `'expired'` 표시,
  primary(`is_redundant_label=false`)는 submission을 `'queued'`로 환원 후 만료 평가자 제외하고 재배정.
- `assignQueued(rng?)` — `status='queued'` submission 픽업하여 배정.
- 두 함수 모두 status 기반 쿼리라 **멱등적** — 중복/동시 실행 안전.

**신규:**
- `src/app/api/cron/sweep-assignments/route.ts` — 얇은 route handler.
- `vercel.json` — `crons` 항목 1개.
- `src/env.ts` (t3-env) — `CRON_SECRET` 서버 env.
- 테스트 — route 인증 분기 + sweep 통합.

**비범위 (이번 사이클 아님):**
- 알림(D-②), 정산/환불(D-③).
- 분 단위 정밀도, 동시 실행 분산 락 (daily 단발이라 불필요).
- admin 트리거 UI 버튼.

## 3. 아키텍처

```
Vercel Cron  (schedule: "0 18 * * *"  = UTC 18:00 = KST 03:00, 오프피크)
   │  Vercel이 Authorization: Bearer ${CRON_SECRET} 자동 주입
   ▼
GET /api/cron/sweep-assignments
   │  1) Authorization 헤더의 bearer 토큰 == CRON_SECRET 검증 (불일치/누락 → 401)
   │  2) expireOverdueAssignments()  → 만료 표시 + primary 재배정
   │  3) assignQueued()              → 환원분 + 기존 대기분 픽업
   ▼
200 + SweepResult JSON  (만료 수 / 재배정 수 / 픽업 수)
   + 구조화 console 로그 (Vercel cron 로그에 노출)
```

## 4. 핵심 결정

1. **인증** — `CRON_SECRET`(t3-env 서버 env). Vercel cron이 호출 시
   `Authorization: Bearer ${CRON_SECRET}`를 자동 첨부한다. 라우트는 이 헤더를 검증하고,
   불일치/누락 시 **401**(500 아님). 외부 무단 호출 차단.
2. **실행 순서** — expire → assignQueued. expire가 primary 만료 건을 `queued`로 환원하므로,
   같은 실행 내 assignQueued가 곧바로 픽업한다.
3. **타임존** — Vercel cron은 UTC 기준. `0 18 * * *`(UTC) = KST 03:00 오프피크.
4. **관측성** — `SweepResult`를 JSON 응답 + 구조화 로그로 노출. 알림은 deferred이므로
   실패 시 non-200 + Vercel cron 로그가 유일한 신호(이번 범위엔 알림 없음).
5. **수동 트리거 겸용** — 동일 엔드포인트를 admin이 `CRON_SECRET`으로 직접 호출 가능.
   기존 "admin 수동 호출" 니즈를 흡수. 별도 UI는 비범위.
6. **에러 격리** — expire가 throw해도 부분 결과를 로깅하고 적절한 status 반환.
   DB 트랜잭션 경계는 기존 함수 내부 그대로 유지(신규 트랜잭션 도입 안 함).

## 5. 인터페이스 계약

**Route:** `GET /api/cron/sweep-assignments`
- **Req header:** `Authorization: Bearer <CRON_SECRET>`
- **200:** `{ ok: true, expired: { ... SweepResult }, queued: { ... SweepResult } }`
- **401:** `{ ok: false, error: "unauthorized" }` (토큰 불일치/누락)
- **500:** `{ ok: false, error: "sweep_failed" }` (sweep 함수 throw)

**Env (t3-env server):** `CRON_SECRET: z.string().min(1)`

## 6. 테스트

- 인증: 헤더 없음 → 401, 잘못된 토큰 → 401, 올바른 토큰 → 200 (sweep 모킹).
- 통합: 만료 임박/만료 배정 시드 → 라우트 호출 → 만료·재배정 검증.
  기존 `ASSIGNMENT_TEST_DB=1` 가드 재사용, 일반 CI는 skip.
- typecheck/lint clean 유지.

## 7. 사이드 이펙트 점검

- sweep 함수 자체는 미변경 → 기존 단위/통합 테스트 회귀 없음.
- `vercel.json`에 cron 추가는 배포 시에만 활성화. 로컬/CI 무영향.
- `CRON_SECRET` 미설정 환경: t3-env가 빌드/부팅 시 실패시킴 → 배포 전 누락 감지.
  (Vercel 프로젝트 env에 `CRON_SECRET` 추가 필요 — 배포 체크리스트 항목.)
