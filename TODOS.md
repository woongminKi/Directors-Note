# Director's Note — TODOS

Deferred work tracked here. Source of truth for "do this later." Items grouped by trigger condition.

> **Status 2026-05-21:** Approach-B (Vertex multimodal embedding) 코드 경로 ready. GCP/Vertex 자격증명 셋업 + `VertexVideoAnalysisService` 실구현 (`6efbb47`) + reference video 시드 스크립트 (`7457b27`). 8 commits origin/main 푸시. 남은 외부 액션 3개 — migration 0010 적용 / Vertex smoke test (~0.001 USD) / 친구 학원 reference 영상 촬영. Migration 미적용 또는 reference 영상 0개면 Vertex 호출 시 D8 degrade.
>
> **Status 2026-05-14:** Kakao OAuth working (kiwoongmin's own account seeded as 카타르시스 owner for dogfooding). A3 walkthrough completed. A3 6 bugs all resolved (`e33610f` / `5e40652` / `775a549` / `13d9882`). D6 PIPA 게이트 제거, student-videos Storage bucket + RLS 셋업.

---

## After v1 ships AND first paying academy validates demand

- **PortOne / Toss PG integration** — replace bank-transfer + tax-invoice workflow with proper Korean payment-gateway. Trigger: academy #2 signs paid.
- **Capacitor / native app shell** — iOS/Android wrapper around the Next.js webview. Trigger: paying academy explicitly requests offline mode or better camera access. Earliest: month 4.
- **Reference library admin UI with metadata schema** — replace the Google Drive folder + filename convention with a proper admin upload page (level / scene_type / technique_tag fields). Trigger: 2nd academy joins; manual GDrive process won't scale to multi-academy.

## After v1 ships AND coach asks for format flexibility

- **Coach-defined feedback format templates (KaTalk-style importer)** — let coaches upload their existing feedback format (e.g., a screenshot or text sample of their current KakaoTalk feedback messages) and have the AI generate parent-letter output in THAT visual style + tone. Approved v1 design is the card-report style (Approach B from /plan-design-review on 2026-05-09); this TODO is the v2 "make our format match yours" path. **Why it matters:** coach has been sending feedback in KaTalk format for years; parents are conditioned to that format; matching it lowers adoption friction and creates a per-coach moat surface in addition to calibration. **Trigger:** friend explicitly asks for it OR a second academy onboarding stalls because their existing format is too different from card-report. **Distinguishes from calibration moat:** calibration is "AI judges according to coach's pedagogy"; format-template is "AI delivers in coach's existing visual format." Both stack.

## After 3+ academies onboard (multi-academy operations)

- **Pgvector HNSW index** — promote from sequential scan to HNSW index when total reference videos exceed ~1000. Trigger: cumulative ref-video count > 1000.
- **Multi-tenant admin/billing dashboard** — founder is currently running ops manually. Trigger: 3+ paying academies; manual ops eats too much founder time.
- **Structured Korean tone EVAL suite** — upgrade from lightweight 10-sample blind-judging to a 30-50 sample structured EVAL with multiple judges. Trigger: tone disagreements between coaches at different academies emerge, OR 3+ academies onboard.
- **Automated LLM-as-judge for tone fidelity** — Claude / GPT scoring HyperCLOVA outputs in CI. Trigger: prompt-template iteration cadence justifies CI automation (>1 prompt change per week).

## After calibration validates (week-2 kill-criterion passes)

- **Multi-axis scoring expansion (5 axes)** — add diction and body_alignment scoring axes once 3-axis is validated against the friend's tier. Trigger: kill-criterion passes AND friend explicitly asks for finer-grained scoring.
- **Async background processing for evaluations** — replace sync pipeline with queue-based processing. Trigger: monthly evaluation count exceeds ~500 OR videos routinely exceed 5 minutes.

## Indefinitely deferred (premise-locked)

- **B2C parent paywall on grade-detail unlocks** — Premise P3 says monetizing parent anxiety on minor grades is regulatorily fragile. Re-evaluate only if the regulatory landscape changes substantively.
- **Customer-facing AI grading of minors** — Premise P2 says AI grades stay coach-facing internal only. Re-evaluate only with explicit Korean PIPA guidance permitting it.

## Year-1 ops (post-pilot)

- **Annual Korean PIPA compliance audit by external auditor** — once paid revenue exists, get a third-party audit of consent flows, retention, cross-border, and incident-response. Trigger: end of fiscal year 1, or first regulatory inquiry.
- **Vendor data-processing agreements** — confirm Vertex / Gemini / Korean LLM vendor's actual data-processing terms (not just `do_not_train` flags). Codex flagged this as hand-waved in the eng review. Trigger: pre-launch (week 5-6), have legal counsel sign off on specific terms with each vendor.
- **Backup / disaster recovery** — Supabase managed backup is implicit; document RPO/RTO + restore-test once per quarter. Trigger: post-revenue.
- **Plan B embedding path** (Gemini-describe-then-text-embed) — if Vertex multimodal embeddings produce poor cosine signal in production at multi-academy scale, fall back to Gemini description + text embedding. Trigger: cosine-confidence drops below 0.7 average across 100+ evaluations.

## Deferred from T30 (2026-05-10)

- [~] **Kakao OAuth vs pre-invited users**: When a coach is invited via `inviteUserByEmail`, Supabase creates an `auth.users` row with a magic-link identity. If the coach later signs in via Kakao OAuth, Supabase may create a *different* `auth.users.id` for the Kakao identity provider — causing the `/auth/callback` `id` mismatch check to reject them. Test end-to-end: invite a user via T30 invite form, have them log in with Kakao OAuth, and verify they land on `/students` without error. If IDs diverge, consider linking identities via `supabase.auth.admin.linkIdentity` or using the email match path in `/auth/callback` instead of ID match.
  - **2026-05-28 mitigation**: `/admin/users/new` page swapped to a v1 banner ("초대 폼 비활성") so the invite flow is not surfaced. Server action + tests preserved for post-T30 reactivation. v1 pilot is single-owner; additional coaches seeded manually via Phase 2 pattern in `docs/production-deploy-plan.md`. Real fix (identity linking or callback heal) deferred until friend academy needs a 2nd coach.

## Deferred from E2E auth setup (2026-05-14) — RESOLVED 2026-05-14

- [x] **Playwright `storageState` fixture generation** → Option (c) cookie-direct shipped (commit `e2dad92`). `bun run e2e:auth-setup` writes `tests/.auth/{owner,coach}.json` via password-grant + `@supabase/ssr` cookie-value encoding. E2E specs run with `E2E_AUTH_READY=1 bun run test:e2e`. Production Kakao OAuth path untouched.

## E2E test-selector follow-ups (2026-05-14) — RESOLVED 4/4 (E1 done 2026-05-29)

E2E auth working; all 4 spec failures fixed.

- [x] **E2E-D3** (`dashboard.spec.ts`): nav-link picked up by overly-permissive Korean-text regex → tightened to `a[href^='/students/']` (trailing slash disambiguates from nav `/students`).
- [x] **E2E-S1** (`students.spec.ts`): missing storage at `describe` level → added `test.use({ storageState: "tests/.auth/owner.json" })`. Also surfaced the `year` schema bug (see new entry below); test now fills year explicitly + uses unique student name per run.
- [x] **E2E-S3** (`students.spec.ts`): same storage-missing root cause + same year-required workaround. List assertion now matches `STUDENT_DELETED` prefix (archive action wipes name for PIPA).
- [x] **E2E-E1** (`review-send.spec.ts`) — RESOLVED 2026-05-29. The FIXME ("submit doesn't fire under headless") was a misdiagnosis. Real cause: **non-idempotency** — the test picked the shared seed's first student and SENT that student's monthly eval, so re-runs/parallel hit `duplicate` (submit produced no nav) or had no startable 이번 달 평가 (/coach-form never reached). Fix: the test now provisions its OWN consent-on student per run (owner ctx creates via /students/new; coach ctx drives eval→review→send, since eval actions are `requireAuth`). `test.skip(true)` removed. Verified 3/3 consecutive + full parallel suite 11 pass/1 skip (skip = approach-c-stub stub). Also fixed a `waitForURL("**/students/*")` race that matched /students/new itself. Op note: E2E fixtures expire ~1h — reseed + `e2e:auth-setup` before runs; local webServer is CI-only so pass `PLAYWRIGHT_BASE_URL`.

## Real product bug surfaced 2026-05-14 — RESOLVED 2026-05-14

- [x] **student form `year` schema bug**: previously `z.string().min(1).max(20).optional()` rejected empty submissions with zod's English default. Resolved: dropped `.min(1)` (the data model is nullable text, no minimum required), added Korean message on `.max(20)`, and introduced `normalizeYear()` in `src/lib/students/schema.ts` — actions call it before insert so blank/whitespace lands as `null`. Friend's UI now accepts blank year; tests in `schema.test.ts` cover empty string + normalizer edges.

## A3 dogfooding bug list (2026-05-14, kiwoongmin Kakao OAuth → 카타르시스 owner)

Real end-to-end walkthrough: start eval (이서준) → bullet form → AI letter → review/edit → send → parent share-link → 박지우 cross-coach access.

- [x] **Home `/` stub preview links** — `src/app/page.tsx` was the pre-auth dev stub linking to `/evaluation/preview-id/coach-form` (literal placeholder). Real session hit it, Postgres exploded with `invalid input syntax for type uuid: "preview-id"`. Fix: `/` redirects logged-in → `/dashboard`, otherwise → `/login`. Commit `e33610f`.
- [x] **share-link pepper via Postgres GUC** — `get_parent_feedback()` used `current_setting('app.share_link_pepper')` which is always NULL on Supabase (platform blocks `app.*` GUC SET regardless of role; `ALTER DATABASE` / `ALTER FUNCTION` / `ALTER ROLE` all fail 42501). Fix: pepper becomes a function arg passed by Next.js service-role handler. Migration 0006. Commit `5e40652`. Future: migrate to Supabase Vault during prod cutover.
- [x] **parent card `evaluation_date` blank** — type defined `eval_date` but RPC returned `evaluation_date`; React rendered `undefined` → empty line. Rename. Commit `775a549`.
- [x] **coach email PII on parent surface** — share-link card displayed raw coach email (`dev-coach@catharsis.test`). Replaced with `users.display_name` (migration 0007), surfaced as "{name} 드림" with `coalesce(display_name, '담당 선생님')` fallback (migration 0008). Auth callback backfills `display_name` from `auth.users.user_metadata.name` on every login when it differs. Seed script populates 원장/코치 for dev fixtures. Existing kiwoongmin row backfilled to '웅' inline. Commit `775a549`.
- [x] **archive dialog false claim** — "이 작업은 되돌릴 수 없습니다" but `archiveStudent` is a soft-delete (sets `soft_deleted_at`), reversible via the 보관됨 filter. Rewrote message to match actual behavior. (pending commit)
- [x] **student detail consent date uses server locale** — `toLocaleDateString()` without locale arg renders inconsistently per server. Switched to `kstToday(date)` for KST `YYYY-MM-DD`. (pending commit)
- [x] **/privacy route 404** — parent share-link footer linked to `/privacy` but no such route. Removed the link for now; real privacy policy page must be drafted (with lawyer) before parent surface goes live. See "Pending operator actions" below for the follow-up. (pending commit)

## Pre-friend-onboarding shipping requirements (2026-05-14)

Must complete before friend's first parent share-link is sent to a real parent.

- [~] **Privacy policy page** — v1-draft shipped 2026-05-21 (`src/app/privacy/page.tsx`). PIPA 11개 섹션 (수집 항목 / 목적 / 보유기간 / 제3자 제공 / 위탁 (Supabase·Vercel·OpenAI·Kakao) / 정보주체 권리 / 안전성 / 자동화 의사결정 / 보호책임자 / 권익침해 구제 / 변경이력) + 상단 amber 배너 "초안 / 외부 법률 검토 중". Footer 링크 복원 (parent-report-card.tsx). **남은 일:** 외부 변호사 검토 → 배너 제거 + 시행일 갱신. AI 영상 분석 활성화 시 §1 생체정보 섹션 추가 + parent consent v2 와이어링.
- [ ] **Production deploy decisions C1/C2/C3** — see `docs/production-deploy-plan.md`. Three choices owed: (1) split-prod-Supabase before-or-after friend's first OAuth, (2) custom-domain vs vercel.app subdomain, (3) Kakao app strategy (single vs multi). Without these, ship is on dev infra.

## Vertex Approach-B follow-ups (2026-05-21)

`VertexVideoAnalysisService` 와 reference seed 스크립트는 ship됐지만 실제 작동 verify 안 됨. 아래 3개 외부 액션이 unblock 조건.

- [ ] **Migration 0010 적용** — `migrations/0010_cosine_search_references.sql` 의 `search_reference_matches` RPC. Supabase MCP read-only + harness 차단으로 자동 apply 안 됨. **사용자 액션:** Supabase SQL Editor 에서 파일 내용 Run (1분). 미적용 상태에서 Vertex 호출하면 `function search_reference_matches does not exist` → D8 degrade.
- [ ] **Vertex smoke test 실행** — `bun --env-file=.env.local run vertex:smoke-test ./sample.mp4`. OAuth → GCS upload → Vertex predict → cleanup 풀 경로 검증. 비용 ~0.001 USD. 처음 호출은 응답 10-30초.
- [ ] **친구 학원 reference 영상 촬영 + 시드** — Vertex cosine 매칭이 의미있게 동작하려면 academy 당 reference 10-20개 필요. 영상 확보 후: `bun --env-file=.env.local run seed:reference-video --academy <uuid> --tier <A|B|C|D> --scene-type <type> --file <path>`. 학원당 1-2 cents.
- [ ] **GCP 서비스 계정 키 sync 위험 회피** — 키 파일이 `~/Desktop/gcp-keys/directors-note-vertex.json` 에 있음. iCloud Drive Desktop & Documents 동기화 켜져있으면 클라우드 노출. **사용자 액션:** `mv ~/Desktop/gcp-keys ~/.gcp-keys && sed -i.bak "s|~/Desktop/gcp-keys|~/.gcp-keys|g" .env.local`... 실제로는 `.env.local` 의 `GOOGLE_APPLICATION_CREDENTIALS_JSON` 은 키 파일 경로가 아니라 inlined JSON 이므로 파일만 옮기면 OK. 친구 prod 셋업 전까지.
- [ ] **D12 LLM-as-judge escalation 와이어링** — `shouldEscalateToJudge()` 헬퍼만 작성, caller 경로 미연결. cosine 신뢰도 낮은 (`top1 < 0.70` 또는 `gap < 0.05`) 경우 GPT-4 또는 Claude 로 escalate. v1 후순위. Trigger: 첫 실 evaluation 에서 cosine 분포 확인 후.
- [ ] **V1 axes 한계 해결** — 단일 영상 embedding 으로 vocal/expression/examReadiness 분리 측정 불가, 셋 다 동일 점수. 학원당 axis-별 reference embedding 시드 (vocal 강조 영상 셋, expression 강조 영상 셋 ...) 시 분리 가능. Trigger: 친구 학원에서 axis 별 다른 점수 요구할 때.

## Deferred from T14 review (2026-05-10) — RESOLVED 2026-05-14

- [x] **Timezone fix**: `src/lib/evaluations/start-action.ts` `todayISO()` uses UTC. KST coaches creating evaluations between 00:30–09:00 KST will see wrong date. Replace with `Asia/Seoul`-aware today string. → Replaced by `kstToday()` in `src/lib/datetime.ts`. Also applied to `dashboard/queries.ts:cycleDeadline` and `coach-form/page.tsx:today` (same bug pattern).
- [x] **Race condition**: No `UNIQUE(student_id, evaluation_date)` constraint on `evaluations` table. Double-submit during start-evaluation creates duplicate rows. Add migration 0005 + `.onConflictDoNothing()` in `startEvaluation`. → Migration `0005_evaluations_unique_per_day.sql` applied; `startEvaluation` uses `.onConflictDoNothing({ target: [studentId, evaluationDate] })` with re-fetch-on-conflict fallback. Behavior change: sent-same-day path now resumes the sent row instead of creating a new one (one eval per student per day).

## Deferred from dashboard final review (2026-05-12) — RESOLVED 2026-05-13/14

F1-F7 (code fixes) shipped 2026-05-12 in commits `2ef2579`, `df6f7b9`, `91dd9df`, `ef843e9`, `9d277f0`, `e45396e`.

- [x] **`students.year` migration apply** (operator action) → Migration 0003 applied 2026-05-13 via MCP `apply_migration` (commit `35768ed`). Column now exists; dashboard queries no longer fail.
- [x] **Postgres CHECK for `status='sent' → sentAt IS NOT NULL`** → Migration 0004 applied 2026-05-13. Constraint `feedback_drafts_sent_at_consistency` enforces the invariant at schema level (commit `35768ed`). F7 runtime filter remains as belt-and-braces.

## Implementation complete (2026-05-10)

All 32 tasks from `docs/superpowers/plans/2026-05-10-student-eval-letter-flow.md` shipped to main.

**Phases:**
- 1 (Auth foundation): T1-T6 — env, getCurrentUser, requireAuth/Role, login, OAuth callback, dev-bypass removal
- 2 (Schema): T7 — students.year migration draft
- 3 (Students CRUD): T8-T13 — schema, queries, actions, form, pages, archive modal
- 4 (Eval start): T14-T15 — startEvaluation action + button wiring
- 5 (Approach-A wire): T16 — coach-form actions wiring + redirect
- 6 (Review/Send): T17-T22 — validate-letter, share-link, finalizeAndSend, review page, editor, share-link card, E2E
- 7 (Parent landing): T23-T25 — service-role client, RPC test, parent landing page
- 8 (Approach-C stub): T26-T29 — upload action, SSE handler, video upload UI, streaming timeline, tests
- 9 (Admin invite): T30-T31 — admin layout, invite form, integration test
- 10 (Cleanup): T32 — verify dev bypass + signup gone + seed guards

**Pending operator actions (NOT code tasks):**
- ~~Apply migration `0003_students_year.sql.draft` to dev Supabase~~ → done 2026-05-13 (commit `35768ed`).
- ~~Generate real `SHARE_LINK_PEPPER` via `openssl rand -base64 48` and set in `.env.local`~~ → already set (64-char hex, 256-bit) per `.env.local` audit 2026-05-14.
- ~~Configure Kakao OAuth in Supabase Auth dashboard (provider settings + redirect URL)~~ → done 2026-05-14; kiwoongmin's account verified end-to-end (OAuth → callback → Phase 2 seed → dashboard → eval → send → share-link).
- Set `NEXT_PUBLIC_APP_URL` to production domain (currently `http://localhost:3000` for dev). Tied to C2 (prod deploy decision).
- Create Supabase Storage bucket `student-videos` with appropriate policies (only when `FEATURE_AI_VIDEO_ANALYSIS=true`).
- Verify pre-invited users can complete Kakao OAuth round-trip (T30 caveat — auth.users.id may differ across providers). Test after friend's first OAuth login.
- (Hardening, deferred) Restore `--read-only` flag on supabase MCP in `~/.claude.json` — already done 2026-05-14, takes effect next session restart.
