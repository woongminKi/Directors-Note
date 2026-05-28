# Session Log — 2026-05-28

5/21 푸시 이후 1주일 만의 재개. 사용자 우선순위: "프로그램 완성" 최우선. 미루기 항목 3 (reference videos) / 5 (PIPA 자문) / 6 (iCloud sync). 이번 세션은 추천 우선순위 P0→P1→P2 순회로 진행.

다른 머신에서 작업했던 .env.local이 현재 디렉토리에 없어 dev server / E2E 직접 실행 불가. 정적 분석 + 코드 패치 + 결정 lock + 운영 doc만 작성하는 모드로 합의.

---

## 0. P0 — 사용자 외부 액션 대기

| 액션 | 명령 | 비용 |
|---|---|---|
| Migration 0010 적용 | Supabase SQL Editor 에서 `migrations/0010_cosine_search_references.sql` Run | 0 |
| Vertex smoke test | `bun --env-file=.env.local run vertex:smoke-test ./<sample.mp4>` | ~0.001 USD |

미실행 상태에선 Vertex 실호출 검증 불가. 코드 경로는 5/21에 이미 ready (`6efbb47`).

---

## 1. P1.3 — 5/21 4커밋 Approach-A 회귀 점검 ✅

정적 분석으로 완료. dev server 없이 가능한 범위까지.

### baseline
- `bun run lint` — clean (107 files)
- `bun run typecheck` — clean
- `bun run test:ci` — 109 pass / 1 skip (5/21 105 pass 대비 +4 — consent v2 통합 테스트)

### 회귀 위험도 매트릭스

| Commit | 변경 surface | 테스트 커버리지 | Approach-A 영향 |
|---|---|---|---|
| `8206d84` consent v2 | actions.ts write, student-form.tsx UI | 통합 테스트 4건 신규 (ON/OFF/preserve/clear) | 낮음 — write 검증됨, UI 추가만 |
| `cb9c71d` delete_student lock | migration 0011/0012 (GRANT/REVOKE) | 코드 변경 0 | 0 — "기존 동작 변경 없음" |
| `3953f00` constants split | constants.ts 분리 | vertex.test.ts 단순화 | 0 — Approach-A 무관 |
| `5f16777` /privacy + footer | parent-report-card.tsx +10 lines | 신규 0 | 낮음 — `target=_blank` 링크 추가 |

### 핵심 발견
- `parentConsentVersion`은 **write-only**. UI 어디서도 read 안 함 → legacy student row (version=null) 영향 없음
- migration 0011/0012는 advisor cleanup 목적뿐, 적용 여부 무관하게 authenticated 코치 archive 작동
- Approach-A는 코드 수준 회귀 무관, ship 가능

### 미검증 (env 복원 시점에 확인 권장)
- 학생 폼 새 레이아웃 모바일 반응성
- /privacy · /parent-consent 정적 prerender 실제 렌더
- parent-report-card 푸터 모바일 깨짐 여부
- migration 0011/0012 dev Supabase 적용 상태 (적용 안 해도 작동, advisor 청결만 차이)

---

## 2. P1.4 — E1 E2E (review-send.spec.ts) 복원 ✅ (패치 작성, 검증 보류)

### Root cause 가설
Playwright `.fill()`은 `input` 이벤트만 dispatch — `blur` 없음. shadcn Textarea + FormField의 controlled value 흐름에서 마지막 필드가 react-hook-form 상태에 commit되지 않은 채로 submit click → handleSubmit이 validation 실패 감지 → onSubmit 호출 안 됨. FIXME 증상 "no toast / no error / no nav"과 정확히 일치.

### 패치
```ts
await page.getByLabel(/입시 완성도/).fill("본방 70%");
await page.getByLabel(/입시 완성도/).press("Tab");  // ← 한 줄 추가
```

`test.skip(true)` FIXME 가드는 유지. 사용자가 env 복원 후 직접 skip 떼고 `E2E_AUTH_READY=1 bun run test:e2e tests/e2e/review-send.spec.ts` 검증.

---

## 3. P2.5 — Production deploy C1/C2/C3 결정 + 셋업 ✅

### 결정 lock

| Decision | Choice |
|---|---|
| **C1 — Supabase env split** | B (별도 prod project `directors-note-prod`, ap-northeast-2 Seoul) |
| **C2 — Domain** | `*.vercel.app` subdomain (학원 #2 시점에 재평가) |
| **C3 — Kakao 앱** | A (단일 앱 + multi Redirect URI) |
| **Timing** | 친구 첫 OAuth 이전 prod 셋업 |
| **Prod academy 이름** | `카타르시스 연기학원` (dev와 동일명, 새 UUID) |

### Artifacts
- `scripts/seed-prod-academy.ts` 신규 — 멱등, name 인자 옵션, academy 1개만 INSERT (no users / no students)
- `package.json` — `db:seed-prod-academy` script 추가
- `docs/production-deploy-plan.md` 전면 갱신 — Phase 1 (Supabase prod 생성 + 마이그레이션 0001→0012 + academy seed) → Phase 2 (Vercel + env) → Phase 3 (Kakao Redirect URI + Supabase Auth wiring + 익명 스모크) → Phase 4 (친구 OAuth + 수동 Phase 2 owner seed SQL)

실제 실행은 사용자 대시보드 액션 필요 (Supabase / Vercel / Kakao Developers).

---

## 4. P2.6 — T30 pre-invited user + Kakao OAuth ID mismatch ✅ (v1 mitigation 적용)

### 분석
- Invite action: `inviteUserByEmail` → auth.users 미리 생성 (magic-link identity) + public.users 같은 id INSERT
- Callback: `findFirst(users.email = OAuth user.email)` → 그 다음 `row.id !== data.user.id`면 reject
- T30 risk: Kakao OAuth 시 Supabase가 다른 auth.users.id 부여하면 (link identities OFF default) callback이 reject

### v1 실제 영향
- **Owner 친구 = Phase 2 manual seed**: 친구 OAuth 먼저 → admin이 SQL Editor에서 INSERT. id mismatch 없음. 안전.
- **Coach invite via admin form**: v1 pilot은 owner 1인. 두 번째 코치 초대는 나중. **v1 ship 안 막힘.**

### 적용된 mitigation
- `src/app/(admin)/users/new/page.tsx` → amber 배너 "v1에서는 초대 폼 비활성. 수동 등록 운영 문서 참조"
- Server action (`actions.ts`) + invite-form + 통합 테스트 → 보존 (post-T30 reactivation 위해)
- TODOS.md T30 항목 → `[~]` 부분 해결로 마킹 + mitigation 노트
- 진짜 fix (`admin.linkIdentity` 또는 callback id-heal) → 친구 학원 2번째 코치 필요 시점으로 deferred

---

## 5. 변경 파일 요약

```
M  TODOS.md                                  T30 v1 mitigation 노트
M  docs/production-deploy-plan.md            결정 lock + Phase 1-4 runbook
M  package.json                              db:seed-prod-academy 추가
M  src/app/(admin)/users/new/actions.ts      T30 NOTE 코멘트 (no behavioral)
M  src/app/(admin)/users/new/page.tsx        v1 banner UI 차단
M  tests/e2e/review-send.spec.ts             Fix A: .press("Tab") 추가
A  scripts/seed-prod-academy.ts              prod academy 1개 seed (idempotent)
A  docs/2026-05-28-session-log.md            본 문서
```

### 검증
- `bun run lint` — clean
- `bun run typecheck` — clean
- `bun run test:ci` — 109 pass / 1 skip (E1 그대로 skip, 패치 효과는 env 복원 후 검증)

---

## 6. Resume / 다음 세션 외부 액션

```bash
# 1. .env.local 복원 (다른 머신에서 전송)
mv ~/Downloads/.env.local ./

# 2. P0 외부 액션
# 2a. Supabase SQL Editor → migrations/0010_cosine_search_references.sql Run
# 2b. Vertex smoke test
bun --env-file=.env.local run vertex:smoke-test ./<sample.mp4>

# 3. (선택) E1 E2E 검증
# tests/e2e/review-send.spec.ts 의 line 16 test.skip(true) 제거
E2E_AUTH_READY=1 bun run test:e2e tests/e2e/review-send.spec.ts

# 4. (선택) 모바일 시각 회귀
bun run dev
# /students/new (consent 토글 레이아웃) + /feedback/<token> (privacy 푸터) + /privacy + /parent-consent

# 5. Prod 셋업 — docs/production-deploy-plan.md Phase 1-4 순서대로
```

---

## 7. 한 줄 요약

env 없이 가능한 범위 — P1.3 정적 분석 (Approach-A ship 가능), P1.4 패치 (Tab blur), P2.5 결정 lock + prod runbook + seed 스크립트, P2.6 v1 banner mitigation. 6 modified + 2 new, 모두 그린, 미커밋 상태.
