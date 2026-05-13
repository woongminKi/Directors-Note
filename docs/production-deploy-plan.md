# Production Deploy Plan — Director's Note v1

**Status as of 2026-05-14:** planning only — no prod env exists yet. This doc captures the decisions you need to make + the steps once those decisions are locked.

Trigger to execute: friend has done first OAuth, walked through the app on dev, accepted the v1 surface as good enough to share with parents. Likely 1-2 weeks out.

---

## Current state (dev environment)

| Resource | Value |
|----------|-------|
| Supabase project | `kyizppeuvalqjtnhyqgf` (shared with dev) |
| Domain | `localhost:3000` (no public URL) |
| Vercel project | not created |
| Kakao app | one app, `Default Rest API Key` configured for localhost |
| CI | `.github/workflows/ci.yml` (lint + typecheck + vitest) — added 2026-05-14 |
| Migrations applied | 0001 → 0005 |
| Seeded data | 1 academy (카타르시스), 2 test users (dev-owner/coach), 5 students, 3 evals |

Real friend data has not yet entered the system. The dev Supabase IS the place friend will eventually use unless we split before going live.

---

## C1: Supabase environment split — recommendation

### Options

**A) Keep one project (current state).** Dev seed data + real friend data coexist.
- Pros: zero migration overhead, faster to ship
- Cons: dev fixtures pollute friend's reality (`dev-owner@catharsis.test` shows up in queries); accidental `bun run db:seed-dev` would clobber real students; PIPA optics — test users alongside real students is not great

**B) Create a separate prod Supabase project.**
- Pros: clean separation; safe to seed/wipe dev freely; PIPA-compliant audit trail
- Cons: extra setup; need to mirror migrations across both; service-role keys to manage in two places

**Recommendation: B (separate prod project)**, executed BEFORE friend's first real login. The first real student row is the moment of no return — once it exists in dev, you can't safely re-seed without losing data.

### Migration when split happens

1. New Supabase project (suggest name: `directors-note-prod`, region: ap-northeast-2 — Seoul)
2. Apply migrations 0001 → 0005 in order via Supabase CLI or MCP `apply_migration`
3. Seed only the 카타르시스 academy row + nothing else (no test users)
4. Update Vercel project env to point at prod Supabase URL + keys
5. Keep dev Supabase as-is for ongoing development

### Cleanup needed before split

- Run `db:seed-dev` clears stale fixtures already; OK.
- Verify no real data leaked into dev (currently no real users → safe).
- `migrations/` is the source of truth — both projects start from the same SQL.

---

## C2: Vercel project setup

### Steps (after C1 decision)

1. **Create Vercel project** linked to GitHub repo `woongminKi/Directors-Note`
   - Production branch: `main`
   - Framework preset: Next.js
2. **Set env vars** in Vercel project Settings → Environment Variables (Production environment):
   - `NEXT_PUBLIC_SUPABASE_URL` = prod Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = prod anon
   - `SUPABASE_SERVICE_ROLE_KEY` = prod service-role
   - `DATABASE_URL` = prod Supabase pooled connection string
   - `OPENAI_API_KEY` = production OpenAI key (separate quota from dev recommended)
   - `KAKAO_OAUTH_CLIENT_ID` = same Kakao app's REST API key (see C3)
   - `KAKAO_OAUTH_CLIENT_SECRET` = same Kakao app's Client Secret
   - `SHARE_LINK_PEPPER` = NEW 32-byte hex (do NOT reuse dev pepper — share-link tokens differ between envs)
   - `NEXT_PUBLIC_APP_URL` = production URL (TBD — pick a domain)
   - `FEATURE_AI_VIDEO_ANALYSIS` = `"false"` (until PIPA gate clears Vertex)
3. **Domain**:
   - Cheapest path: free `*.vercel.app` subdomain (e.g. `directors-note-catharsis.vercel.app`)
   - Custom domain: any registered domain pointed at Vercel. Cost ~10-15$/year.
   - For first pilot academy: `*.vercel.app` is fine. Custom domain when academy #2 onboards.
4. **First deploy**:
   - Push to `main` triggers auto-deploy via Vercel GitHub integration
   - Verify build succeeds (env vars validated at build time)
   - Visit production URL → `/login` page should render
5. **Update Supabase Auth Provider**:
   - Production Supabase project → Auth → Providers → Kakao → enable
   - Same Kakao Client ID + Secret as dev (see C3)
6. **Add prod redirect URI to Kakao**:
   - Kakao Developers → 카카오 로그인 → Default Rest API Key → Redirect URI 추가:
     - `https://<prod-supabase-ref>.supabase.co/auth/v1/callback`
   - Keep dev redirect URI too (both work simultaneously)

### Build-time concerns

- `next build` runs `env.ts` validation. Missing env vars → build fails. Set them in Vercel BEFORE first deploy.
- Bun on Vercel: Vercel detects bun.lock and uses Bun runtime automatically.

---

## C3: Kakao app strategy

### Options

**A) Single Kakao app for dev + prod**, with multiple Redirect URIs registered (current setup).
- Pros: simple, one set of credentials to manage
- Cons: dev login flow shows production app name in consent screen ("카타르시스" — actually fine, since the app belongs to the academy)

**B) Separate Kakao app for prod.**
- Pros: cleaner separation; can revoke dev access without affecting prod
- Cons: 친구 needs to set up 2 apps; consent screens differ

**Recommendation: A (single app)** — for a single-tenant pilot, this is overkill to split. Re-evaluate when academy #2 onboards.

### What needs to happen in Kakao Developers

Already done: `Default Rest API Key` with localhost redirect + Client Secret.

Add when prod is up:
- Redirect URI: `https://<prod-supabase-ref>.supabase.co/auth/v1/callback`
- (If using custom domain: also add `https://<custom-domain>/auth/callback` for direct flow, but Supabase OAuth uses its own callback so this is optional)
- Platform → Web → 사이트 도메인 → add production domain alongside localhost

### account_email permission

Still pending Kakao approval (see `docs/oauth-handoff.md`). Same approval covers dev + prod.

---

## C4: CI — already done

`.github/workflows/ci.yml` runs lint + typecheck + vitest on every PR + push to main. Real secrets are NEVER committed; CI uses zod-valid placeholders only.

**Pending CI additions** (deferred):
- E2E tests (`bun run test:e2e`) — gated on `E2E_AUTH_READY` env. Requires Playwright storageState fixtures generated via Supabase Admin. ~1h work. Defer until friend has used the app and we know what flows actually matter to regress on.
- `next build` smoke test — could add to catch build-time env validation errors. Low cost.

---

## Deploy runbook (when ready)

```bash
# 1. Pre-deploy local check
bun run lint
bun run typecheck
bun run test:ci

# 2. Push to main
git push origin main

# 3. Vercel auto-deploys. Monitor:
#    - https://vercel.com/<your-team>/directors-note → Deployments
#    - Build log should pass env validation
#    - "Ready" status within ~2 min

# 4. Smoke test prod URL
#    - / → loads
#    - /login → renders Kakao button
#    - /dashboard → redirects to /login (no session)

# 5. Friend logs in via Kakao OAuth
#    - Lands on /auth/not-invited (expected — Phase 2 not yet done)

# 6. Phase 2 owner seed (via MCP on prod)
#    SELECT id FROM auth.users WHERE email = '<friend>';
#    INSERT INTO public.users (id, academy_id, role, email) VALUES (...);

# 7. Friend refreshes → /dashboard with empty state
```

## Rollback strategy

If a deploy breaks production:
1. **Vercel dashboard → Deployments → previous good deploy → Promote to Production** (~10 sec)
2. Fix the issue in a PR, re-deploy
3. If DB migration was involved: write a forward fix migration (don't rollback the DB — forward-only)

For migrations specifically:
- Apply via MCP `apply_migration` only after dev verification
- Use `supabase db diff` to preview against prod state
- Migration files in `migrations/` are source of truth; both projects should converge to the same state

---

## Decisions you need to make before executing

1. **Prod Supabase project name** — suggested `directors-note-prod` (region ap-northeast-2)
2. **Production domain** — `*.vercel.app` subdomain OR custom domain (which?)
3. **Timing** — execute prod split before or after friend's first OAuth login?
   - Recommend: **before**. Friend logs into prod directly; dev stays clean for testing.

Once you've decided, ping me and I'll write the migration runbook + execute the steps via MCP where possible.

---

## Open items (for follow-up)

- **Vercel pricing**: free tier covers v1 (single-tenant low traffic). Re-evaluate when 3+ academies onboard.
- **Monitoring**: no Sentry / no logging dashboard yet. v1 acceptable; add when scale > pilot.
- **Backups**: Supabase managed daily backups are automatic. Document RPO/RTO when revenue exists (per `TODOS.md` year-1 ops section).
- **Custom domain SSL**: Vercel auto-provisions Let's Encrypt. No action needed.
