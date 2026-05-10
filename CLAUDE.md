## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

## Project context — Director's Note (입시학원 AI video evaluation)

**Status:** Pre-product, planning complete. Code 시작 전.
**Source of truth:** `~/.gstack/projects/directors-note/`
- `kiwoongmin-unknown-design-20260509-203619.md` — design doc (APPROVED)
- `frontend-stack-v1.md` — frontend stack (LOCKED)
- `schema-v1.md` + `migrations/0001_init.sql.draft`, `0002_rls.sql.draft` — schema (PIPA 의견 대기)
- `llm-bakeoff/` — Korean LLM bake-off (gpt-4o-mini v1 잠정 락, prompt v2)
- `designs/` — 3개 wireframe (parent share-link B / streaming progress A / tone register B)
- `TODOS.md` (project root) — 미루기 항목

**Locked v1 stack:**
- Next.js 15 + React 19 (App Router) on Vercel
- Supabase (Postgres + Auth + Storage + pgvector) + RLS on every multi-tenant table (D5/D9)
- Drizzle ORM + Supabase CLI 마이그레이션 (SQL source of truth)
- Zod + drizzle-zod / react-hook-form + server actions / TanStack Query
- @supabase/ssr + 카카오 OAuth
- Tailwind v4 + shadcn/ui + Pretendard via next/font/local
- 네이티브 SSE (EventSource) for streaming progress UI
- Vitest + Playwright / Biome / Bun
- 한국어 LLM: gpt-4o-mini 직접 fetch + 추상 인터페이스 (HyperCLOVA/Solar 후보 v2)
- Vertex AI multimodal embeddings (D4) — PIPA 의견 후 코드 작성 (D6 게이트)
- t3-env for env validation

**Locked design (Section 2):**
- 부모 share-link: 카드형 리포트 (B안)
- 코치 streaming progress: 수직 타임라인 (A안)
- 한국어 letter 톤: 따뜻한 정중체 (B안 register)

**Hard gates:**
- Week-2 calibration kill-criterion (≥7/10 tier match on non-student data per D13) — fail 시 LLM-as-judge 로 primary 전환
- Week-6 revenue gate — 페이드 학원 0이면 Approach-A fallback 으로 ship
- D6 PIPA gate — 변호사 의견 받기 전엔 Vertex 코드 X, 마이그레이션 X
- P2 — AI grade 부모 surface 노출 절대 금지 (코치 only)
- P3 — B2B seat pricing only, 부모 paywall X

**Approach-A fallback:** feature flag `FEATURE_AI_VIDEO_ANALYSIS=false` 시 코치 불릿 폼 surface (D6/D8/D14).
