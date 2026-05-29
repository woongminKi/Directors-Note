# Session Log — 2026-05-29 (다른 머신 이어서 작업: P0 Vertex verify + P1 시각 회귀)

`docs/2026-05-28-handoff.md` 절차대로 다른 머신에서 작업 재개. `.env.local` 복원 완료 상태에서 시작.

---

## 0. 세션 시작 상태

- `git`: `1436edd` (origin/main 동일, working tree clean)
- `.env.local` 복원 검증: 11개 env 로드 (Supabase / OpenAI / Kakao / Vertex / GCS / SHARE_LINK_PEPPER)
- Vertex 자격증명 preflight: `GOOGLE_APPLICATION_CREDENTIALS_JSON` 유효 (service_account, project `directors-note`), location `asia-northeast1`, 4개 env 정상
- `FEATURE_AI_VIDEO_ANALYSIS=false`

---

## 1. P0 — Vertex 경로 verify ✅ 완료

### P0-1 — migration 0010/0011/0012 적용 (사용자 직접, dev Supabase SQL Editor)

- `0010_cosine_search_references.sql` — `search_reference_matches` pgvector cosine RPC (SECURITY DEFINER + `p_academy_id` 명시 격리, service_role only)
- `0011_revoke_anon_delete_student.sql` — `delete_student` anon EXECUTE revoke
- `0012_lock_down_delete_student.sql` — PUBLIC revoke 후 authenticated/service_role 만 GRANT
- 결과: `Success. No rows returned` (3개 합본 1-paste, 전부 idempotent)
- 적용 대상: dev Supabase project `kyizppeuvalqjtnhyqgf`
- 참고: 처음엔 `DATABASE_URL`로 직접 적용 시도했으나 권한 분류기가 라이브 DB 마이그레이션을 차단 → SQL Editor 직접 paste 로 전환

### P0-2 — Vertex smoke test ✅

- 입력 영상: YouTube `v=SzGCWQ1ZBF0` 30초 클립 (854x480, 2.1MB) — `yt-dlp`(brew 설치)로 단일 영상만 다운로드
- `bun --env-file=.env.local run vertex:smoke-test` 실행
- 결과: **GCS 업로드 OK → Vertex `multimodalembedding@001` (asia-northeast1) OK → cleanup OK**
  - elapsed 11,670ms, embedding dims **1408**, l2 norm **1.000000**, 정상 임베딩 벡터
- 비용 ≈ 0.001 USD
- **Vertex 코드 "ready" → "verified" 승격 완료**

### 신규 설치 (의존성)

- `yt-dlp` (Homebrew, openssl@3 + python@3.14 동반) — 일회성 다운로드용. 불필요 시 `brew uninstall yt-dlp`.

---

## 2. P1 — Approach-A 시각 회귀 (모바일) — 🔴 회귀 2건 발견 → ✅ 둘 다 수정·검증 완료

`bun run dev`로 dev 서버 기동 후 모바일 뷰(390x844) 점검. 발견 후 사용자 승인 받고 수정 (CLAUDE.md QA 규칙: 확인 후 수정). lint·typecheck clean 확인.

### 환경 메모

- `localhost:3000`에는 **다른 프로젝트 `forsithub`** 가 떠 있었음 (Director's Note 아님). 혼동 주의.
- `localhost:3001`도 사용 중. Director's Note dev 서버는 **`PORT=3007`** 로 기동 (Next.js 16.2.6 Turbopack, `.env.local` 로드).

### FINDING-001 (HIGH) — `/privacy` · `/parent-consent` 가 비인증 부모에게 `/login` 으로 리다이렉트

- **현상:** `http://localhost:3007/privacy`, `/parent-consent` 접근 시 `/login?next=...` 로 리다이렉트.
- **근본 원인:** `src/proxy.ts` (Next 16에서 middleware → proxy 로 명칭 변경) 의 `isPublic` 허용 목록(29–36행)에 `/privacy`, `/parent-consent` 누락. `/feedback/` 는 허용돼 있음.
- **영향 (부모 차단):**
  - `src/app/feedback/[token]/parent-report-card.tsx:41` — 부모 share-link 카드 푸터의 `<a href="/privacy" target="_blank">개인정보처리방침</a>` → 비인증 부모가 누르면 로그인으로 튕김.
  - `src/app/parent-consent/page.tsx:218` — 동의서 본문이 `/privacy` 링크.
  - `src/app/(coach)/students/components/student-form.tsx:114` — 학생 등록 폼의 `/parent-consent` "동의서 전문 보기" 링크.
  - `parent-consent` 자체가 부모 대면 페이지인데 로그인 요구 → 부모가 동의서 열람 불가.
- **수정:** `src/proxy.ts` `isPublic` 에 `pathname.startsWith("/privacy")`, `pathname.startsWith("/parent-consent")` 2줄 추가.
- **검증 ✅:** `/privacy`(h1 "개인정보처리방침"), `/parent-consent`(h1 "학생 평가 서비스 부모(법정대리인) 동의서") 둘 다 리다이렉트 없이 200. 모바일 가로 스크롤 없음, Pretendard 적용된 깨끗한 레이아웃 확인.
- **상태:** ✅ 수정·검증 완료 (커밋 대기)

### FINDING-002 (HIGH) — Pretendard 폰트 파일이 HTML 문서임 (커스텀 폰트 미적용)

- **현상:** 콘솔 경고 `Failed to decode downloaded font: /fonts/Pretendard-Variable.woff2`, `OTS parsing error: invalid sfntVersion: 168430090`.
- **근본 원인:** `public/fonts/Pretendard-Variable.woff2` (306,647 bytes) 의 실제 내용이 **`<!DOCTYPE html>` HTML 문서**. 폰트 바이너리 대신 다운로드 에러/랜딩 페이지가 저장됨. `file` 결과: `HTML document text`.
- **영향:** Locked 스택의 브랜드 서체 Pretendard 가 전혀 로드되지 않음. 모든 페이지가 시스템 폴백(`-apple-system` / `Apple SD Gothic Neo`)으로 렌더. 렌더된 `body` font-family 1순위는 Pretendard 선언돼 있으나 디코드 실패로 폴백.
- **수정:** 정식 Pretendard Variable woff2 (orioncactus/pretendard v1.3.9, jsDelivr) 다운로드 후 매직 바이트 `wOF2` 검증하고 `public/fonts/Pretendard-Variable.woff2` (2,057,688 bytes) 로 교체. 코드 변경 없음.
- **검증 ✅:** fresh 브라우저(빈 캐시)에서 콘솔 폰트 에러 소멸, `document.fonts.check('16px Pretendard')` → `true`. (주의: 옛 깨진 폰트가 브라우저 캐시에 남아 일반 reload 로는 검증 불가 → browse 세션 `restart` 후 확인)
- **상태:** ✅ 수정·검증 완료 (커밋 대기)

### 시각 점검 결과 (도달 가능 페이지, 모바일)

| Surface | 도달 | 모바일 레이아웃 | 비고 |
|---|---|---|---|
| `/login` | ✅ | 정상 (중앙 정렬, 카카오 버튼) | 수정 후 Pretendard 적용 |
| `/feedback/<invalid-token>` | ✅ | 정상 ("만료되었거나 유효하지 않은 링크입니다" 에러 상태 graceful) | — |
| `/privacy` | ✅ (수정 후) | 정상 (amber 초안 배너 + 11섹션 + 표, 가로 스크롤 X) | FINDING-001 수정으로 접근 가능 |
| `/parent-consent` | ✅ (수정 후) | 정상 (amber 배너 + 제1·2부 + PIPA 제23조 생체정보 동의 + 위탁업체 표, 가로 스크롤 X) | FINDING-001 수정으로 접근 가능 |
| `/students/new` | ❌ | 확인 불가 | 코치 인증 필요 (Kakao OAuth) |
| `/feedback/<valid-token>` 카드 + privacy 푸터 | ❌ | 확인 불가 | 유효 토큰(시드 데이터) 필요 |

- 스크린샷: `/tmp/dn-p1-shots/{login,feedback-invalid,privacy,parent-consent}-mobile.png`
- **남은 미확인:** `/students/new`(코치 OAuth 로그인 필요)와 `/feedback/<valid-token>` 부모 카드+privacy 푸터(평가/토큰 시드 필요)는 헤드리스에서 인증·시드 없이 도달 불가. 코치 로그인 또는 dev 시드 후 별도 확인 권장.

---

## 2.5. P1.4 — E1 E2E 인증 와이어링 — ✅ 와이어링 완료, ⚠️ E1 spec 은 skip 유지

**핵심:** E2E 인증 와이어링 코드는 이미 존재했음 (없던 건 "이 머신에서 셋업 스크립트 실행"). 워크플로우는 `tests/.auth/README.md` 에 문서화돼 있었음.

**한 일:**
- `bun run db:seed-dev` — 코치(`dev-coach@catharsis.test` / pw `Catharsis-dev-2026!`) + owner + 학원(`554c68ef-...`) + 학생 5 + 평가 3 시드 (dev Supabase)
- `bun run e2e:auth-setup` — 패스워드 grant → `tests/.auth/{coach,owner}.json` storageState 생성 (쿠키 `sb-kyizppeuvalqjtnhyqgf-auth-token`, domain `localhost`, ~1h 만료). gitignored.
- `bunx playwright install chromium` — Playwright 브라우저 바이너리 설치 (미설치 상태였음)
- 로컬은 playwright `webServer` 가 CI 에서만 동작 → `PLAYWRIGHT_BASE_URL=http://localhost:3007` 로 실행 (기본값 :3000 은 forsithub)

**검증 ✅ (auth 와이어링 작동 증명):**
- `tests/e2e/dashboard.spec.ts` **5/5 passed** (단독 실행) — storageState 인증·RLS 정상

**E1 (`review-send.spec.ts`) — `/investigate` 로 루트 원인 규명 후 재작성 → skip 제거, 안정화 ✅** (아래 2.6 참조)

## 2.6. E2E 안정화 (`/investigate`) — ✅ 루트 원인 규명 + E1 멱등화

**증상:** 전체 병렬 5/12 실패, review-send 플레이키, students 단독 실패.

**루트 원인 (확정, Iron Law 대로 수정 전 규명):**
- **대부분은 오염 변수였음.** fixtures ~1h 만료 + 내 반복 실행이 남긴 더러운 DB. **fresh 재시드 + fixtures 재발급하면 전체 병렬 suite가 그냥 통과** (students 단독 실패도 이것 — `input[name=name]` 셀렉터는 정상, 드리프트 아님). 즉 suite 는 근본적으로 깨져있지 않았음.
- **진짜 결함은 review-send(E1) 하나 = 비멱등.** 공유 시드의 "첫 학생"을 골라 그 학생의 "이번 달 평가"를 발송 → 시드가 startable 평가를 보장 안 함 + 한 번 발송하면 소비됨. FIXME 의 "submit 핸들러 미발화"는 **오진**(전제 충족 시 submit 정상, 7.7s 통과가 증거).

**수정 (`tests/e2e/review-send.spec.ts` 재작성, 프로덕션 코드 무변경):**
- 공유 시드 의존 제거. 테스트가 **owner 컨텍스트로 전용 consent-on 학생 생성 → coach 컨텍스트로 평가→review→발송** (eval 액션은 `requireAuth` 라 코치 OK, `/students/new` 만 owner 전용).
- 16행 `test.skip(true)` 제거. 오진 FIXME 주석 정리.
- 미세 버그 수정: 학생 생성 후 `waitForURL("**/students/*")` 가 현재 `/students/new` 에도 매치돼 리다이렉트 전 URL을 캡처 → 코치가 `/students/new` 로 가서 목록으로 튕김. **상세 heading(학생 이름) 가시화 대기**로 교체.
- controlled(RHF) 입력은 `toHaveValue` 로 commit 대기 후 submit; 네비 대기는 클릭과 `Promise.all`.

**검증:**
- review-send **3/3 연속 통과 (재시드 없이)** — 멱등성
- 전체 병렬 suite **11 passed / 1 skipped / 0 failed** (skip 은 approach-c-stub 의도된 스텁). 2회 연속(재시드 없이)도 동일 → 스위트 멱등.
- lint·typecheck clean, `test:ci` 109 pass / 1 skip (회귀 없음)

**운영 메모 (E2E 돌리기 전):** `bun run db:seed-dev` → `bun run e2e:auth-setup` (fixtures ~1h 만료) → `E2E_AUTH_READY=1 PLAYWRIGHT_BASE_URL=http://localhost:3007 bun run test:e2e`. 로컬 webServer 는 CI 에서만 뜨므로 BASE_URL 로 실행 중인 dev 서버 지정 필수.

## 3. 변경된 파일

**이미 커밋·푸시됨 (`1436edd..519dce8`):**
- `src/proxy.ts` — isPublic 에 `/privacy`, `/parent-consent` 추가 (FINDING-001)
- `public/fonts/Pretendard-Variable.woff2` — HTML → 정식 woff2 교체 (FINDING-002)
- `.gitignore` — `.gstack/` 추가
- `docs/2026-05-29-session-log.md` — 세션 로그 (이후 본 세션에서 추가 갱신)

**커밋 대기 (E2E 안정화):**
- `tests/e2e/review-send.spec.ts` — 멱등 재작성 + skip 제거 (2.6)
- `docs/2026-05-29-session-log.md` — 2.5/2.6 추가 갱신

> 커밋은 CLAUDE.md 규칙(명시 요청 시에만)에 따라 사용자 확인 후 진행.

## 4. 다음 작업

1. **E2E 안정화 커밋** (사용자 요청 시) — 예: `test(e2e): make review-send idempotent (own student) and un-skip E1`
2. (선택) valid feedback token 시드 후 부모 share-link 카드/privacy 푸터 모바일 점검 (P1 미확인 surface)
3. **P2** — Prod 셋업 Phase 1~4 (`docs/production-deploy-plan.md`). ✅ `scripts/prod-bootstrap.sql` 은 0001→0012 합본이라 0010~0012 이미 포함 (prod 커버됨). dev 에만 이번에 수동 적용.

---

## 5. 한 줄 요약

P0 Vertex 풀 경로 verified (embedding 1408d, l2=1.0). P1 모바일 회귀에서 HIGH 2건 발견·수정·검증 — (1) `proxy.ts` isPublic 에 `/privacy`·`/parent-consent` 누락으로 비인증 부모 차단 → 허용 추가, (2) Pretendard woff2 가 HTML 파일이라 브랜드 폰트 미적용 → 정식 woff2 교체. lint·typecheck clean. 커밋 대기.
