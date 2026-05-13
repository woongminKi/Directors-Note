# Kakao OAuth Handoff — pending user action

**Owner:** kiwoongmin (this repo) · **Friend's role:** pilot academy owner — 카타르시스 연기학원 · **Status as of 2026-05-14:** waiting on credentials + first login

## Why this doc exists

Most of v1's code is shipped. What's left is operator work that needs real
Kakao + Supabase credentials and the friend's actual first OAuth round-trip:

- Phase 2 owner seed (link `auth.users` → `public.users`)
- T30 identity-link verification (pre-invited magic-link vs Kakao OAuth)
- E2E auth setup (Playwright `storageState` files)

Until these credentials + first login happen, those three items are blocked.
Code-side, nothing else is queued.

---

## 1. Credentials you need to collect

| Item | Where to get it | Goes into |
|------|----------------|-----------|
| Kakao OAuth Client ID | [Kakao Developers](https://developers.kakao.com/console/app) → Your App → 카카오 로그인 → 보안 → REST API 키 (or 클라이언트 ID) | `.env.local`: `KAKAO_OAUTH_CLIENT_ID` + Supabase Auth dashboard |
| Kakao OAuth Client Secret | Same screen → 보안 → Client Secret (활성화 후 생성) | `.env.local`: `KAKAO_OAUTH_CLIENT_SECRET` + Supabase Auth dashboard |
| Friend's email (the address they'll use for Kakao OAuth) | Ask 친구 | Used in Phase 2 owner seed SQL (manual lookup in `auth.users` after first login) |
| Production domain (when ready to deploy) | Vercel / whatever host | `.env.local`: `NEXT_PUBLIC_APP_URL` (currently `http://localhost:3000`) |

The first two are env-validated by `src/lib/env.ts:12-13` — without them
the Next.js app fails to boot.

---

## 2. Supabase Auth dashboard setup

1. Supabase project (ref: `kyizppeuvalqjtnhyqgf`) → **Authentication → Providers → Kakao**
2. Toggle **Enable**.
3. Paste `KAKAO_OAUTH_CLIENT_ID` and `KAKAO_OAUTH_CLIENT_SECRET`.
4. Copy the **Callback URL** Supabase generates (looks like
   `https://kyizppeuvalqjtnhyqgf.supabase.co/auth/v1/callback`).
5. Back in Kakao Developers → 카카오 로그인 → Redirect URI → paste the Supabase
   callback URL. **Do not** put the app domain here — Supabase brokers the
   exchange, then redirects back to `<NEXT_PUBLIC_APP_URL>/auth/callback?next=...`
   which is handled by `src/app/auth/callback/route.ts`.
6. Save.

When deploying to production, also add the prod-domain `/auth/callback` URL
to Kakao's allowed redirect list (Kakao only enforces an allowlist on the
final destination, not on Supabase's broker URL — but having both registered
keeps both dev and prod flows working).

---

## 3. Friend's first-login flow

Tell 친구:

1. Open `http://localhost:3000` (or wherever the dev server is) → `/login`.
2. Click **카카오로 로그인**.
3. Kakao consent screen → approve.
4. Lands on `/auth/not-invited` (expected — no `public.users` row exists yet for them).
5. Ping you (the developer) saying "I logged in once."
6. You do Phase 2 below, then they refresh → land on `/students`.

---

## 4. Phase 2 owner seed (developer action after friend's first login)

Once friend has logged in once (step 5 above), open this repo, run
`/context-restore`, and execute:

```sql
-- Get the friend's auth uid (replace <friend@email.com>)
SELECT id, email, created_at, raw_user_meta_data->>'provider' AS provider
FROM auth.users WHERE email = '<friend@email.com>';

-- Then INSERT, plugging in the uid:
INSERT INTO public.users (id, academy_id, role, email)
VALUES (
  '<auth.users.id from above>',
  '554c68ef-3244-44a3-96a1-397185ad41ea',  -- 카타르시스 연기학원
  'owner',
  '<friend@email.com>'
);
```

The academy id is fixed (see `memory/project_pilot_academy.md`). The auth
uid comes from the first OAuth round-trip, so it cannot be hardcoded ahead
of time.

After this INSERT, friend refreshes `/` → `getCurrentUser` finds the
`public.users` row → `requireAuth` passes → dashboard renders.

## 5. T30 identity-link verification

The auth callback at `src/app/auth/callback/route.ts:45` rejects when
`row.id !== data.user.id`. This means:

- Magic-link invite flow creates `public.users.id = auth.users.id` (from the
  T30 `inviteUserByEmail` admin action).
- If Kakao OAuth then assigns a *different* `auth.users.id` to the same email,
  the callback redirects to `/auth/not-invited` instead of `/students`.

Test plan after Phase 2:
1. Invite a second user (a test coach account) via the T30 admin form.
2. That user logs in via Kakao OAuth.
3. Check whether they land on `/students` (good) or `/auth/not-invited`
   (mismatch — needs `supabase.auth.admin.linkIdentity` or callback rewrite
   to email-match instead of id-match).

If mismatch shows up, the fix is in `src/app/auth/callback/route.ts:45` —
swap the id-match for an email-match plus an explicit `linkIdentity` call.
Decide based on the test outcome, not preemptively.

## 6. E2E auth setup (Playwright `storageState`)

After Phase 2, generate persistent auth fixtures so E2E tests don't have to
re-OAuth every run:

```bash
# Owner (friend's account, or a test owner — your call)
bun playwright codegen \
  --save-storage=tests/.auth/owner.json \
  http://localhost:3000/login

# Coach (need a second invited account first)
bun playwright codegen \
  --save-storage=tests/.auth/coach.json \
  http://localhost:3000/login
```

Files go in `tests/.auth/` (gitignored — they hold session cookies). Wire
into `playwright.config.ts` via `use.storageState`. After wiring, all
auth-gated E2E specs (`tests/e2e/*`) become runnable in CI.

## 7. After all of the above

These remaining checklist items get unblocked together:

- [ ] Phase 2 INSERT into `public.users` for friend's account
- [ ] T30 mismatch verification — invite-then-OAuth on a test account
- [ ] `tests/.auth/owner.json` + `tests/.auth/coach.json` storageState fixtures
- [ ] Wire `storageState` into `playwright.config.ts` projects
- [ ] Unblock E2E test runs in CI

When you bring credentials back, mention "OAuth handoff" — I'll re-read this
doc and follow the steps above.
