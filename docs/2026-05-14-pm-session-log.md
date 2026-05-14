# Session Log — 2026-05-14 PM

Evening session following the morning roll-up (`05ab147`). 5 commits, focused on real-world dogfooding of the full coach workflow under a genuine Kakao OAuth session — the first time a real auth.users row has touched the app. Surfaced 6 product bugs, all fixed. Unlocked Approach-B (video analysis) by removing the D6 PIPA hard gate; first foundation piece (Storage bucket) shipped.

Reference HEAD at session end: `ace5b22`. Branch: `main`, not pushed.

---

## 1. Kakao OAuth dogfooded end-to-end

Started the session with a `KOE205` (잘못된 요청) on the Kakao consent screen. Investigation: it was the documented `account_email` scope issue from the morning session log §9. User rotated the Kakao OAuth credentials (Client ID + Secret) on the same app, paired Supabase Auth dashboard with the new values, and got past the consent screen.

**Outcome:** `rldndals@naver.com` (kakao 닉네임 '웅') landed on `/auth/not-invited` — exactly the documented flow. Phase 2 seed (`public.users` INSERT linking auth uid to 카타르시스 academy as owner) executed via Supabase SQL Editor (MCP was in read-only mode, so the developer ran the INSERT manually). After refresh: `/dashboard` rendered.

**State after:** First real `public.users` row (`7bf87ac8-f301-4275-af7a-8487cab2c923`) exists. Kakao OAuth working end-to-end on dev infra. Phase 2 done for kiwoongmin's own account; friend's real onboarding still deferred.

## 2. A3 dogfooding bug list — 6 surfaced, 6 fixed

Walked the full coach workflow: dashboard → 평가 시작 (이서준) → coach bullet form → AI letter generation (gpt-4o-mini) → review/edit → 발송 → parent share-link → also tested 박지우 draft (created by dev-coach, accessed by owner).

| # | Bug | Commit |
|---|-----|--------|
| 1 | `/` (home) still rendered the pre-auth dev stub with `href="/evaluation/preview-id/coach-form"` — literal placeholder UUID. First click after login exploded with `invalid input syntax for type uuid: "preview-id"`. | `e33610f` — `/` now redirects logged-in → `/dashboard`, otherwise → `/login`. Stub deleted. |
| 2 | Parent share-link page returned "만료/유효하지 않은 링크" immediately after a real send. Root cause: `get_parent_feedback()` used `current_setting('app.share_link_pepper')`, which is always NULL on Supabase. Platform blocks `SET` on `app.*` GUCs regardless of role — `ALTER DATABASE` / `ALTER FUNCTION` / `ALTER ROLE` all fail `42501`. | `5e40652` — migration 0006, pepper becomes a function argument passed by the Next.js service-role handler. Trust boundary identical (env already holds pepper for hash generation on send). All 5 prior sent share-links remained valid. |
| 3 | Parent card showed blank "평가일" — type defined `eval_date` but RPC returned `evaluation_date`. React rendered `undefined`. | `775a549` — type and JSX rename. |
| 4 | Parent card exposed raw coach email ("작성 dev-coach@catharsis.test"). PII + unprofessional. | `775a549` — migration 0007 adds nullable `users.display_name`. Migration 0008 RPC returns `coalesce(display_name, '담당 선생님')` instead of email. Auth callback backfills `display_name` from `auth.users.user_metadata.name` on every login when it differs. Seed script populates 원장/코치. kiwoongmin's row backfilled inline to '웅'. |
| 5 | Archive dialog claimed "이 작업은 되돌릴 수 없습니다" — but `archiveStudent` is a soft-delete (`soft_deleted_at`), reversible via the 보관됨 filter. False claim. | `13d9882` — copy rewritten to describe actual behavior. |
| 6 | Student detail page consent date used `toLocaleDateString()` with no locale arg — leaked server locale. | `13d9882` — switched to `kstToday(date)` for consistent KST `YYYY-MM-DD`. |
| 7 | Parent share-link footer linked to `/privacy`, but no such route exists — parents would hit 404. | `13d9882` — link removed pending real privacy policy drafting (tracked in TODOS). |

## 3. D6 PIPA hard gate removed

At user direction, the D6 PIPA gate in `CLAUDE.md` ("변호사 의견 받기 전엔 Vertex multimodal embedding 코드 X") was deleted (`ace5b22`). Approach-B (real video analysis via Vertex AI multimodal embeddings) is now in scope for implementation. User committed to obtaining PIPA opinion in parallel — mandatory before friend's production cutover, not as a prerequisite for development.

Memory entry written: `project_d6_gate_removed.md`. The pre-existing `feedback_hard_gate_scope.md` still applies for other gates (P2 parent surface, P3 paywall, Week-2 calibration kill).

`CLAUDE.md` now has a brief "PIPA note" preserving the parallel-opinion commitment.

## 4. Storage bucket: student-videos + RLS

`ace5b22` shipped migration 0009 — the first foundation piece for video analysis:

- Supabase Storage bucket `student-videos`, private, 500 MB cap, video MIME allowlist (`mp4`, `quicktime`, `webm`, `x-matroska`).
- RLS policy on `storage.objects` keyed off `(storage.foldername(name))[1] = users.academy_id`. Service-role bypasses RLS (so `createSignedUploadUrl` keeps working) — policy is defense-in-depth for any future authenticated client path.
- `upload-action.ts:39` bug fix in the same commit: previously stored a `…/public/student-videos/…` URL, which broke when the bucket went private. Now stores the raw path `{academyId}/{evaluationId}.mp4`; the Vertex impl (task 3) will fetch via service-role.

## 5. Production deploy decisions

C1/C2/C3 from `docs/production-deploy-plan.md` surfaced. User decisions:

- **C1 (Supabase split):** **B** — separate prod Supabase project, created BEFORE friend's first real OAuth login.
- **C2 (domain):** not yet decided (recommended `*.vercel.app` for pilot).
- **C3 (Kakao app):** not yet decided (recommended single app shared between dev + prod).

The deploy itself is deferred — user prioritized video-analysis work first.

## 6. Decisions still owed

In priority order:

1. **GCP Vertex creds setup** (Task 2 in active list) — user must create GCP project, enable Vertex AI API, create GCS bucket for transient video storage, create service account with Vertex AI User + Storage Object Admin roles, download JSON key. Concrete 7-step instructions in Task 2 description. Estimated 15-25 min for first-time GCP user. **Blocking task 3 (Vertex impl) and downstream.**
2. **C2 domain** for production deploy (vercel.app vs custom).
3. **C3 Kakao app strategy** (single vs split).
4. **PIPA opinion solicitation** — parallel work; commit was that opinion must be obtained before friend prod cutover. Not blocking development.
5. **Privacy policy drafting** — must precede friend onboarding parent surface. PIPA-compliant Korean text; lawyer review desirable.
6. **Parent consent text v2** — biometric processing language (얼굴/음성 embedding). Drives task 5 (consent version v1 → v2 bump + gating).

## 7. Active task list (TaskCreate state)

| # | Subject | Status | Blocked by |
|---|---------|--------|-----------|
| 1 | Storage bucket: student-videos + RLS | ✅ completed | — |
| 2 | Vertex AI creds 확보 | 🔄 in_progress (user action) | — |
| 3 | VertexVideoAnalysisService 구현 | ⏸ pending | 1, 2 |
| 4 | Reference videos 시드 인프라 | ⏸ pending | 3 |
| 5 | 부모 동의서 생체정보 처리 동의 문구 | ⏸ pending | — (parallel) |
| 6 | End-to-end dogfood: 영상 업로드 → 분석 → letter | ⏸ pending | 3, 4, 5 |

## 8. Files / surfaces touched today

```
CLAUDE.md                                                  D6 gate removed; PIPA note added
TODOS.md                                                   A3 bug list + pre-friend-onboarding requirements + status update
docs/2026-05-14-pm-session-log.md                          this file
docs/production-deploy-plan.md                             (read only — informed C1 decision)
migrations/0006_pepper_as_param.sql                        new
migrations/0007_users_display_name.sql                     new
migrations/0008_get_parent_feedback_display_name.sql       new
migrations/0009_storage_bucket_student_videos.sql          new
scripts/seed-dev-tenant.ts                                 displayName for dev fixtures
src/app/(coach)/students/[id]/page.tsx                     KST consent date
src/app/(coach)/students/components/archive-confirm.tsx    truthful copy
src/app/auth/callback/route.ts                             display_name backfill from kakao meta
src/app/feedback/[token]/page.tsx                          p_pepper passed to RPC; coach_display_name
src/app/feedback/[token]/parent-report-card.tsx            display_name + /privacy link removed + date field rename
src/app/page.tsx                                           home stub → redirect
src/lib/db/schema.ts                                       displayName column
src/lib/evaluations/upload-action.ts                       path-only (private bucket); STUDENT_VIDEOS_BUCKET const
tests/integration/admin/invite-user.test.ts                displayName: null in mock
~/.claude/projects/.../memory/MEMORY.md                    + project_d6_gate_removed entry
~/.claude/projects/.../memory/project_d6_gate_removed.md   new
~/.claude/projects/.../memory/project_pilot_academy.md     (referenced; kiwoongmin Phase 2 done)
```

## 9. Verified vs not (this session)

**Verified end-to-end:**
- Kakao OAuth login (rldndals@naver.com) → callback → Phase 2 seed → dashboard
- 평가 시작 → coach bullet form → AI letter (gpt-4o-mini, B 정중체, ~200자, no prohibited words)
- Review page edit → finalizeAndSend → share-link generation
- Parent share-link page rendering (after pepper fix) — both 이서준 (kiwoongmin as coach) and 박지우 (dev-coach as coach, '담당 선생님' fallback)
- 박지우 cross-coach access — owner CAN review + send a draft created by a different coach
- `coach_display_name` fallback to '담당 선생님' when null
- All migrations 0006/0007/0008/0009 applied to dev Supabase
- `bun run typecheck`, `bun run lint`, `bun run test:ci` (88 + 1 skip) all green after each commit
- Storage bucket exists with correct config + policy registered

**Not verified:**
- Student CRUD walkthrough (new/edit/archive in browser) — code-reviewed only, did not click-test
- Mobile responsive — never tested
- T30 invite-user flow + identity-mismatch behavior (still deferred from morning log)
- account_email kakao approval status — never confirmed; OAuth past KOE205 implies success but not directly verified
- Production deploy (planning only)
- Vertex video analysis — entire pipeline blocked on GCP creds

## 10. Resume instructions

```bash
# Resume
/context-restore

# Refresh local state if dev tenant stale
bun run db:seed-dev

# Verify nothing regressed
bun run lint && bun run typecheck && bun run test:ci

# Check current task state
# (TaskList tool — task 2 is in_progress awaiting GCP creds)
```

**If GCP creds setup is done:**
1. Verify `.env.local` has `GOOGLE_VERTEX_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GCS_VIDEO_BUCKET` set.
2. Restart dev server (env vars reload).
3. Ping me — I'll start task 3 (VertexVideoAnalysisService implementation). Estimated ~1 hour of focused code: vertex.ts module, factory wiring, cosine matching SQL, Vertex API call with google-auth-library, end-to-end test against a sample video.

**If you want to do something else first** (production deploy decisions, friend onboarding prep, student CRUD click-through QA, mobile audit): ping with the choice. Task ordering can flex.

## 11. Pricing / cost guardrails for video analysis

When task 3 lands and we start hitting Vertex:

- `multimodalembedding@001` for video: ~0.001 USD per 10-second segment.
- 100 dogfood analyses ≈ 10 cents. Pilot academy with 50 students × 1 eval/month = 50 calls/month ≈ 5 cents/month. Cheap relative to OpenAI (gpt-4o-mini already costs ~0.1¢ per letter).
- GCS storage (videos): negligible at pilot scale. With 30-day lifecycle delete (recommended), steady-state ~1-2 GB → cents/month.
- No streaming/inference rate-limit concerns at pilot scale.

Real cost: Vertex AI free tier covers initial dogfooding without hitting paid billing.
