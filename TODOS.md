# Director's Note — TODOS

Deferred work tracked here. Source of truth for "do this later." Items grouped by trigger condition.

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

- [ ] **Kakao OAuth vs pre-invited users**: When a coach is invited via `inviteUserByEmail`, Supabase creates an `auth.users` row with a magic-link identity. If the coach later signs in via Kakao OAuth, Supabase may create a *different* `auth.users.id` for the Kakao identity provider — causing the `/auth/callback` `id` mismatch check to reject them. Test end-to-end: invite a user via T30 invite form, have them log in with Kakao OAuth, and verify they land on `/students` without error. If IDs diverge, consider linking identities via `supabase.auth.admin.linkIdentity` or using the email match path in `/auth/callback` instead of ID match.

## Deferred from T14 review (2026-05-10)

- [ ] **Timezone fix**: `src/lib/evaluations/start-action.ts` `todayISO()` uses UTC. KST coaches creating evaluations between 00:30–09:00 KST will see wrong date. Replace with `Asia/Seoul`-aware today string.
- [ ] **Race condition**: No `UNIQUE(student_id, evaluation_date)` constraint on `evaluations` table. Double-submit during start-evaluation creates duplicate rows. Add migration 0005 + `.onConflictDoNothing()` in `startEvaluation`.

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
- Apply migration `0003_students_year.sql.draft` to dev Supabase via `mv ... .sql && supabase db push`.
- Configure Kakao OAuth in Supabase Auth dashboard (provider settings + redirect URL).
- Generate real `SHARE_LINK_PEPPER` via `openssl rand -base64 48` and set in `.env.local`.
- Set `NEXT_PUBLIC_APP_URL` to production domain.
- Create Supabase Storage bucket `student-videos` with appropriate policies (only when `FEATURE_AI_VIDEO_ANALYSIS=true`).
- Verify pre-invited users can complete Kakao OAuth round-trip (T30 caveat — auth.users.id may differ across providers).
