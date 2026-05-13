# tests/.auth

Playwright `storageState` JSON files for E2E tests.

**Not committed** (gitignored) — these contain Supabase session cookies.

## Generate

```bash
# 1. Seed the dev tenant (creates auth users + sets dev passwords)
bun run db:seed-dev

# 2. Generate storageState files
bun run e2e:auth-setup
```

Outputs:
- `owner.json` — logged in as `dev-owner@catharsis.test`
- `coach.json` — logged in as `dev-coach@catharsis.test`

## Run E2E tests with the fixtures

```bash
E2E_AUTH_READY=1 bun run test:e2e
```

Without `E2E_AUTH_READY=1`, the specs in `tests/e2e/*.spec.ts` skip — safe to leave the env var unset for unrelated runs.

## How it works (so you can debug)

Supabase magic links default to **implicit flow** (returns tokens in URL hash fragment) which our `/auth/callback` (PKCE-style) can't consume. So `e2e:auth-setup` takes a different path:

1. `db:seed-dev` sets a known password on each dev user via service-role admin API.
2. `e2e:auth-setup` POSTs `email + password` to Supabase's `/auth/v1/token?grant_type=password` → receives a real session JSON.
3. Encodes the session as `'base64-' + base64url(JSON.stringify(session))` — the `@supabase/ssr` cookie value format.
4. Writes it to a Playwright `storageState` file as cookie `sb-<projectRef>-auth-token`.

When E2E tests load this `storageState`, the @supabase/ssr server client reads the cookie, decodes it, and treats the user as authenticated. No magic-link-flow gymnastics needed.

The dev users' passwords are dev-only and live solely in the seed script + this fixture pipeline. The production Kakao OAuth flow is unaffected.

## Rotation

Sessions expire on the Supabase side (default 1 hour). When tests start failing with redirects to /login, re-run `bun run e2e:auth-setup` to mint fresh storageStates.
