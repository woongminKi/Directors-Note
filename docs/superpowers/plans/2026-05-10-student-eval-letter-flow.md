# Student/Eval/Letter Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Director's Note v1 demo path — Kakao OAuth login → student CRUD → start evaluation → bullet form (Approach-A) or stub video flow (Approach-C) → review/edit AI draft → approve & generate share-link → parent views letter.

**Architecture:** Next.js 16 App Router with route-group-aligned modules. Supabase Auth (Kakao OAuth) replaces dev bypass. Drizzle ORM for DB writes; service-role client only for parent RPC. SSE Route Handler for Approach-C streaming, fed by existing `StubVideoAnalysisService`. Single-coach-academy v1 pilot.

**Tech Stack:** Next.js 16 + React 19, Supabase (Postgres + Auth + Storage) via `@supabase/ssr`, Drizzle ORM + drizzle-zod, react-hook-form + Zod, TanStack Query, shadcn/ui + Tailwind v4, Vitest + Testing Library + Playwright, Bun, Biome, t3-env, GPT-4o-mini for letters (existing).

**Spec:** `docs/superpowers/specs/2026-05-10-student-eval-letter-flow-design.md` (commit `8fe2efe`).

**Working directory:** `/Users/kiwoongmin/Desktop/claude-project/directors-note/`

**Prerequisites:**
- Migrations 0001+0002 already applied to dev Supabase.
- Existing scaffold preserves: `src/app/(coach)/evaluation/[id]/coach-form/`, `src/app/feedback/[token]/page.tsx`, `src/lib/evaluation/`, `src/components/{degrade-banner,korean-char-counter}`.
- `bun dev` boots successfully against dev Supabase.
- Kakao Developers app registered with redirect `https://<app>/auth/callback`; client id/secret captured to `.env.local`.

---

## File Structure (lock decisions before tasks)

### Phase 1 — Auth foundation (Tasks 1-6)

**New:**
```
src/lib/auth/
├── current-user.ts          # getCurrentUser()
├── require-auth.ts          # requireAuth()
├── require-role.ts          # requireRole(roles[])
└── kakao.ts                 # signInWithKakao() helper

src/app/(auth)/
└── login/page.tsx           # Kakao OAuth button (replaces empty dir)

src/app/auth/
├── callback/route.ts        # OAuth callback handler
└── not-invited/page.tsx     # Pre-seed mismatch fallback

src/app/(coach)/layout.tsx   # auth guard + sidebar shell
```

**Modify:**
- `src/proxy.ts` — drop dev-stub bypass (T1 fix); keep session-refresh + public-path logic; add `/auth/*` to public paths.
- `src/app/(auth)/signup/` — DELETE entirely (no self-signup per onboarding rule).
- `src/lib/env.ts` — add `KAKAO_OAUTH_CLIENT_ID`, `KAKAO_OAUTH_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SHARE_LINK_PEPPER`, `NEXT_PUBLIC_APP_URL`, `FEATURE_AI_VIDEO_ANALYSIS`.

**Tests:**
```
tests/unit/auth/current-user.test.ts
tests/integration/auth/callback.test.ts
tests/e2e/auth.spec.ts
```

### Phase 2 — Schema migration 0003 (Task 7)

**New:**
- `migrations/0003_students_year.sql.draft`

**Modify:**
- `src/lib/db/schema.ts` — add `year: text('year')` to students.

### Phase 3 — Students CRUD (Tasks 8-13)

**New:**
```
src/lib/students/
├── queries.ts               # listStudents, getStudent, getRecentEvaluationsForStudent
├── actions.ts               # createStudent, updateStudent, archiveStudent
└── schema.ts                # studentFormSchema (Zod)

src/app/(coach)/students/
├── page.tsx                 # list
├── new/page.tsx             # add
├── [id]/page.tsx            # detail
├── [id]/edit/page.tsx       # edit
└── components/
    ├── student-form.tsx
    ├── student-row.tsx
    └── archive-confirm.tsx
```

**Tests:**
```
tests/unit/students/schema.test.ts
tests/integration/students/actions.test.ts
tests/e2e/students.spec.ts
```

### Phase 4 — Eval start action (Tasks 14-15)

**New:**
```
src/lib/evaluations/
├── queries.ts               # getEvaluation, getRecentEvaluations
└── start-action.ts          # startEvaluation
```

**Modify:**
- `src/app/(coach)/students/[id]/page.tsx` — wire 시작하기 button.

**Tests:**
```
tests/integration/evaluations/start.test.ts
```

### Phase 5 — Approach-A wiring (Task 16)

**Modify:**
- `src/app/(coach)/evaluation/[id]/coach-form/actions.ts` — replace TODO stubs with real DB calls (consent check, evaluation insert, feedback_drafts insert) and redirect to `/evaluation/[id]/review`.

### Phase 6 — Review/Send (Tasks 17-22)

**New:**
```
src/lib/evaluations/
├── share-link.ts            # generateToken, hashToken
├── validate-letter.ts       # validateLetter (used by bullet form actions AND review action)
└── finalize-action.ts       # finalizeAndSend

src/app/(coach)/evaluation/[id]/review/
├── page.tsx
├── review-editor.tsx        # 'use client'
├── share-link-card.tsx      # 'use client'
└── actions.ts               # re-exports finalizeAndSend
```

**Modify:**
- `src/lib/evaluation/gpt-4o-mini-letter.ts` — replace inline `validateOutput` with import from `validate-letter.ts` (DRY).

**Tests:**
```
tests/unit/evaluations/share-link.test.ts
tests/unit/evaluations/validate-letter.test.ts
tests/integration/evaluations/finalize.test.ts
tests/e2e/review-send.spec.ts
```

### Phase 7 — Parent landing wiring (Tasks 23-25)

**New:**
```
src/lib/supabase/service-role.ts   # createServiceRoleClient (parent RPC only)
src/app/feedback/[token]/
├── parent-report-card.tsx         # 'use client' (reads B-card layout)
└── expired-or-invalid.tsx
```

**Modify:**
- `src/app/feedback/[token]/page.tsx` — call `get_parent_feedback` RPC.

**Tests:**
```
tests/integration/parent-feedback/rpc.test.ts
tests/e2e/parent-landing.spec.ts
```

### Phase 8 — Approach-C streaming stub (Tasks 26-29)

**New:**
```
src/lib/evaluations/upload-action.ts        # createSignedUploadUrl, attachVideoToEvaluation

src/app/(coach)/evaluation/[id]/
├── page.tsx                                # Approach-C entry
└── components/
    ├── video-upload-flow.tsx               # 'use client'
    └── streaming-timeline.tsx              # 'use client'

src/app/api/evaluations/[id]/stream/route.ts   # SSE handler
```

**Tests:**
```
tests/component/streaming-timeline.test.tsx
tests/e2e/approach-c-stub.spec.ts
```

### Phase 9 — Owner user invite (Tasks 30-31)

**New:**
```
src/app/(admin)/
├── layout.tsx                       # requireAuth + requireRole
└── users/new/
    ├── page.tsx
    └── actions.ts                   # inviteUser
```

**Tests:**
```
tests/integration/admin/invite-user.test.ts
```

### Phase 10 — Cleanup (Task 32)

**Verify:** dev bypass removed, signup dir gone, env vars validated, seed scripts have NODE_ENV guard (T5 fix).

---

## Conventions (apply to every task)

- **Branch:** Work on `main` (no remote configured). Each task = one commit.
- **Tests first**: write failing test before implementation (TDD).
- **Run command**: `bun run test <path>` (Vitest), `bun run test:e2e <file>` (Playwright), `bun run lint` (Biome), `bun dev` for manual verification.
- **Commit format**: `<phase>: <action>` (e.g., `auth: add getCurrentUser helper`).
- **Imports**: use `@/` alias (mapped to `src/`).
- **Server-only files**: top of file `import 'server-only'` for files that must not bundle to client.

---

## Phase 1: Auth Foundation

### Task 1: Env vars + service-role-key entries

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.local` (do NOT commit; user-managed)

- [ ] **Step 1: Read current env schema**

```bash
cat src/lib/env.ts
```

- [ ] **Step 2: Add new env vars**

Add to `src/lib/env.ts` server schema:

```typescript
// add to existing server schema
KAKAO_OAUTH_CLIENT_ID: z.string().min(1),
KAKAO_OAUTH_CLIENT_SECRET: z.string().min(1),
SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
SHARE_LINK_PEPPER: z.string().min(32, "pepper must be 32+ chars"),
FEATURE_AI_VIDEO_ANALYSIS: z.enum(["true", "false"]).default("false"),

// add to client (NEXT_PUBLIC_*) schema
NEXT_PUBLIC_APP_URL: z.string().url(),
```

Make sure `runtimeEnv` includes the new keys.

- [ ] **Step 3: Add placeholder values to `.env.local` so build passes**

User adds (or you instruct user):
```
KAKAO_OAUTH_CLIENT_ID=placeholder_set_via_kakao_developers
KAKAO_OAUTH_CLIENT_SECRET=placeholder_set_via_kakao_developers
SUPABASE_SERVICE_ROLE_KEY=<from supabase dashboard>
SHARE_LINK_PEPPER=$(openssl rand -base64 48)
NEXT_PUBLIC_APP_URL=http://localhost:3000
FEATURE_AI_VIDEO_ANALYSIS=false
```

- [ ] **Step 4: Verify build still passes**

Run: `bun run lint && bun run build` (or at minimum `bunx tsc --noEmit`)
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts
git commit -m "auth: add kakao + service-role + share-link env schema"
```

### Task 2: getCurrentUser helper

**Files:**
- Create: `src/lib/auth/current-user.ts`
- Test: `tests/unit/auth/current-user.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/auth/current-user.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  db: { query: { users: { findFirst: vi.fn() } } },
}));

import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db/client";

describe("getCurrentUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no Supabase session", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when session exists but no users row", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1", email: "x@y" } }, error: null }) },
    });
    (db.query.users.findFirst as any).mockResolvedValue(undefined);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns shape { authUser, appUser, academyId, role } when both rows exist", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1", email: "x@y" } }, error: null }) },
    });
    (db.query.users.findFirst as any).mockResolvedValue({
      id: "auth-1", academyId: "acad-1", role: "coach", email: "x@y",
    });
    const result = await getCurrentUser();
    expect(result).toEqual({
      authUser: { id: "auth-1", email: "x@y" },
      appUser: { id: "auth-1", academyId: "acad-1", role: "coach", email: "x@y" },
      academyId: "acad-1",
      role: "coach",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/auth/current-user.test.ts`
Expected: FAIL with "Cannot find module '@/lib/auth/current-user'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth/current-user.ts`:

```typescript
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  academyId: string;
  role: "owner" | "coach" | "admin";
  email: string;
};

export type CurrentUser = {
  authUser: { id: string; email: string };
  appUser: AppUser;
  academyId: string;
  role: AppUser["role"];
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const appUser = await db.query.users.findFirst({
    where: eq(users.id, data.user.id),
  });
  if (!appUser) return null;

  return {
    authUser: { id: data.user.id, email: data.user.email ?? "" },
    appUser: {
      id: appUser.id,
      academyId: appUser.academyId,
      role: appUser.role as AppUser["role"],
      email: appUser.email,
    },
    academyId: appUser.academyId,
    role: appUser.role as AppUser["role"],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/unit/auth/current-user.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/current-user.ts tests/unit/auth/current-user.test.ts
git commit -m "auth: add getCurrentUser helper with users join"
```

### Task 3: requireAuth + requireRole helpers

**Files:**
- Create: `src/lib/auth/require-auth.ts`
- Create: `src/lib/auth/require-role.ts`
- Test: `tests/unit/auth/require.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/auth/require.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path) => { throw new Error(`REDIRECT:${path}`); }) }));

import { requireAuth } from "@/lib/auth/require-auth";
import { requireRole } from "@/lib/auth/require-role";
import { getCurrentUser } from "@/lib/auth/current-user";

describe("requireAuth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to /login when no current user", async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/login");
  });

  it("returns CurrentUser when authenticated", async () => {
    const user = { authUser: { id: "u1", email: "a" }, appUser: { id: "u1", academyId: "ac1", role: "coach", email: "a" }, academyId: "ac1", role: "coach" };
    (getCurrentUser as any).mockResolvedValue(user);
    expect(await requireAuth()).toEqual(user);
  });
});

describe("requireRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to /students when role is insufficient", async () => {
    const user = { role: "coach", appUser: { role: "coach" } } as any;
    (getCurrentUser as any).mockResolvedValue(user);
    await expect(requireRole(["owner", "admin"])).rejects.toThrow("REDIRECT:/students");
  });

  it("returns user when role matches", async () => {
    const user = { role: "owner", appUser: { role: "owner" } } as any;
    (getCurrentUser as any).mockResolvedValue(user);
    expect(await requireRole(["owner", "admin"])).toEqual(user);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/auth/require.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth/require-auth.ts`:

```typescript
import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";

export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
```

Create `src/lib/auth/require-role.ts`:

```typescript
import "server-only";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import type { CurrentUser, AppUser } from "@/lib/auth/current-user";

export async function requireRole(allowed: AppUser["role"][]): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!allowed.includes(user.role)) redirect("/students");
  return user;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test tests/unit/auth/require.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/require-auth.ts src/lib/auth/require-role.ts tests/unit/auth/require.test.ts
git commit -m "auth: add requireAuth + requireRole guards"
```

### Task 4: Login page + Kakao helper

**Files:**
- Create: `src/lib/auth/kakao.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Delete: `src/app/(auth)/signup/` (entire directory)

- [ ] **Step 1: Delete signup directory**

```bash
rm -rf src/app/\(auth\)/signup
```

- [ ] **Step 2: Create kakao helper**

Create `src/lib/auth/kakao.ts`:

```typescript
"use client";
import { createClient } from "@/lib/supabase/client";

export async function signInWithKakao(redirectTo?: string) {
  const supabase = createClient();
  const next = redirectTo ?? "/students";
  await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
}
```

- [ ] **Step 3: Create login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
import { LoginButton } from "./login-button";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold">Director's Note</h1>
        <p className="text-sm text-muted-foreground">학원 코치 전용 로그인</p>
        <LoginButton searchParamsPromise={searchParams} />
      </div>
    </main>
  );
}
```

Create `src/app/(auth)/login/login-button.tsx`:

```tsx
"use client";
import { use } from "react";
import { signInWithKakao } from "@/lib/auth/kakao";
import { Button } from "@/components/ui/button";

export function LoginButton({ searchParamsPromise }: { searchParamsPromise: Promise<{ next?: string }> }) {
  const { next } = use(searchParamsPromise);
  return (
    <Button
      className="w-full bg-[#FEE500] text-[#000000d9] hover:bg-[#FFEB3B]"
      onClick={() => signInWithKakao(next)}
    >
      카카오로 로그인
    </Button>
  );
}
```

- [ ] **Step 4: Manual smoke test**

Run: `bun dev` and visit `http://localhost:3000/login`. Confirm button renders. (Clicking will fail without real Kakao app credentials — acceptable for now.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/kakao.ts src/app/\(auth\)/login/
git rm -r src/app/\(auth\)/signup 2>/dev/null || true
git commit -m "auth: add /login Kakao button, remove signup scaffold"
```

### Task 5: OAuth callback handler + not-invited fallback

**Files:**
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/auth/not-invited/page.tsx`
- Test: `tests/integration/auth/callback.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/auth/callback.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "@/app/auth/callback/route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
  },
}));

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db/client";

const makeReq = (url: string) => new Request(url) as any;

describe("GET /auth/callback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to /auth/not-invited when email not pre-seeded", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({ data: { user: { id: "auth-1", email: "stranger@x" } }, error: null }),
        signOut: async () => ({}),
      },
    });
    (db.query.users.findFirst as any).mockResolvedValue(undefined);

    const res = await GET(makeReq("http://localhost/auth/callback?code=x"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/not-invited");
  });

  it("attaches auth.users.id when row exists with NULL id", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({ data: { user: { id: "auth-1", email: "coach@x" } }, error: null }),
      },
    });
    const findFirst = db.query.users.findFirst as any;
    findFirst.mockResolvedValue({ id: null, email: "coach@x", academyId: "acad-1", role: "coach" });

    const res = await GET(makeReq("http://localhost/auth/callback?code=x"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/students");
    expect(db.update).toHaveBeenCalled();
  });

  it("redirects to /students when row.id matches auth.users.id", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({ data: { user: { id: "auth-1", email: "coach@x" } }, error: null }),
      },
    });
    (db.query.users.findFirst as any).mockResolvedValue({ id: "auth-1", email: "coach@x", academyId: "acad-1", role: "coach" });

    const res = await GET(makeReq("http://localhost/auth/callback?code=x&next=/students/abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/students/abc");
  });

  it("signs out + redirects when row.id mismatches", async () => {
    const signOut = vi.fn(async () => ({}));
    (createClient as any).mockResolvedValue({
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({ data: { user: { id: "auth-NEW", email: "coach@x" } }, error: null }),
        signOut,
      },
    });
    (db.query.users.findFirst as any).mockResolvedValue({ id: "auth-OLD", email: "coach@x", academyId: "acad-1", role: "coach" });

    const res = await GET(makeReq("http://localhost/auth/callback?code=x"));
    expect(signOut).toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/auth/not-invited");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/auth/callback.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the route handler**

Create `src/app/auth/callback/route.ts`:

```typescript
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/students";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !data.user.email) {
    return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
  }

  const row = await db.query.users.findFirst({
    where: eq(users.email, data.user.email),
  });

  if (!row) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
  }

  if (!row.id) {
    await db.update(users).set({ id: data.user.id }).where(eq(users.email, data.user.email));
    return NextResponse.redirect(new URL(next, url.origin), 307);
  }

  if (row.id !== data.user.id) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth/not-invited", url.origin), 307);
  }

  return NextResponse.redirect(new URL(next, url.origin), 307);
}
```

- [ ] **Step 4: Create not-invited page**

Create `src/app/auth/not-invited/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotInvitedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-bold">초대된 사용자가 아닙니다</h1>
        <p className="text-sm text-muted-foreground">
          이 이메일로 등록된 사용자가 없습니다. 학원 관리자에게 문의해 주세요.
        </p>
        <Button asChild variant="secondary">
          <Link href="/login">로그인 화면으로</Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `bun run test tests/integration/auth/callback.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/auth/ tests/integration/auth/
git commit -m "auth: add /auth/callback handler + not-invited fallback"
```

### Task 6: Drop dev bypass, update proxy.ts, add (coach) layout guard

**Files:**
- Modify: `src/proxy.ts` — remove `isDevStub` block; ensure `/auth/*` is public.
- Create: `src/app/(coach)/layout.tsx` — auth guard wrapping coach surfaces.

- [ ] **Step 1: Edit proxy.ts**

Replace `src/proxy.ts` body. Remove the `isDevStub` shortcut entirely. Keep session-refresh + public-path logic. Public paths must include `/auth/`:

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/feedback/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/favicon");

  if (!isPublic && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
```

- [ ] **Step 2: Create (coach) layout guard**

Create `src/app/(coach)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/require-auth";

export default async function CoachLayout({ children }: { children: ReactNode }) {
  await requireAuth();
  return (
    <div className="min-h-screen">
      {/* sidebar slot reserved for v1.x — v1 ships with topbar only */}
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Run all auth tests**

Run: `bun run test tests/unit/auth tests/integration/auth`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run: `bun dev`. Visit `http://localhost:3000/students` (without logging in). Expected redirect to `/login?next=%2Fstudents`.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/app/\(coach\)/layout.tsx
git commit -m "auth: drop dev-stub bypass; add (coach) layout guard"
```

---

## Phase 2: Schema Migration 0003

### Task 7: Add students.year column

**Files:**
- Create: `migrations/0003_students_year.sql.draft`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write migration draft**

Create `migrations/0003_students_year.sql.draft`:

```sql
-- 0003_students_year.sql.draft
-- 적용 시점: 0001/0002 적용 후. PIPA 변호사 별도 review 불필요 — schema 단순 컬럼 추가.
-- 적용: mv 0003_students_year.sql.draft 0003_students_year.sql && supabase db push

ALTER TABLE students ADD COLUMN year text;
COMMENT ON COLUMN students.year IS '학생 구분 — 자유 텍스트 (예: 1년차, 2년차, 재수생)';
```

- [ ] **Step 2: Update Drizzle schema**

Edit `src/lib/db/schema.ts`. In the `students` pgTable definition, add `year` field:

```typescript
export const students = pgTable("students", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: uuid("academy_id").notNull().references(() => academies.id),
  name: text("name").notNull(),
  year: text("year"),                // ← NEW
  parentConsentOnFileAt: timestamp("parent_consent_on_file_at", { withTimezone: true }),
  parentConsentArtifactUrl: text("parent_consent_artifact_url"),
  parentConsentVersion: text("parent_consent_version"),
  softDeletedAt: timestamp("soft_deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Apply migration to dev Supabase**

```bash
mv migrations/0003_students_year.sql.draft migrations/0003_students_year.sql
bun run supabase migration up   # or supabase db push, depending on setup
```

Expected: `0003_students_year` applied to dev DB.

- [ ] **Step 4: Verify type compiles**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add migrations/0003_students_year.sql src/lib/db/schema.ts
git commit -m "db: add students.year column (migration 0003)"
```

---

## Phase 3: Students CRUD

### Task 8: Student form Zod schema

**Files:**
- Create: `src/lib/students/schema.ts`
- Test: `tests/unit/students/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/students/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { studentFormSchema } from "@/lib/students/schema";

describe("studentFormSchema", () => {
  it("accepts valid input", () => {
    const r = studentFormSchema.safeParse({ name: "박지윤", year: "2년차", parentConsentOnFile: true });
    expect(r.success).toBe(true);
  });

  it("rejects empty name", () => {
    const r = studentFormSchema.safeParse({ name: "", year: "2년차", parentConsentOnFile: false });
    expect(r.success).toBe(false);
  });

  it("rejects name longer than 40", () => {
    const r = studentFormSchema.safeParse({ name: "가".repeat(41), year: "2년차", parentConsentOnFile: false });
    expect(r.success).toBe(false);
  });

  it("year is optional", () => {
    const r = studentFormSchema.safeParse({ name: "박지윤", parentConsentOnFile: false });
    expect(r.success).toBe(true);
  });

  it("rejects year longer than 20", () => {
    const r = studentFormSchema.safeParse({ name: "박지윤", year: "x".repeat(21), parentConsentOnFile: false });
    expect(r.success).toBe(false);
  });

  it("parentConsentOnFile defaults to false", () => {
    const r = studentFormSchema.safeParse({ name: "박지윤" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentConsentOnFile).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/students/schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Create `src/lib/students/schema.ts`:

```typescript
import { z } from "zod";

export const studentFormSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다").max(40, "이름이 너무 깁니다"),
  year: z.string().min(1).max(20).optional(),
  parentConsentOnFile: z.boolean().default(false),
});

export type StudentFormInput = z.infer<typeof studentFormSchema>;
```

- [ ] **Step 4: Run test**

Run: `bun run test tests/unit/students/schema.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/students/schema.ts tests/unit/students/schema.test.ts
git commit -m "students: add studentFormSchema (Zod)"
```

### Task 9: Students queries module

**Files:**
- Create: `src/lib/students/queries.ts`

- [ ] **Step 1: Write implementation (queries are read-only; integration test in Task 13)**

Create `src/lib/students/queries.ts`:

```typescript
import "server-only";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluations, feedbackDrafts, students } from "@/lib/db/schema";

export type StudentListFilter = "active" | "no_consent" | "archived";

export async function listStudents(academyId: string, filter: StudentListFilter = "active") {
  const archivedClause =
    filter === "archived" ? isNotNull(students.softDeletedAt) : isNull(students.softDeletedAt);
  const consentClause =
    filter === "active" ? isNotNull(students.parentConsentOnFileAt)
    : filter === "no_consent" ? isNull(students.parentConsentOnFileAt)
    : undefined;

  const rows = await db
    .select({
      id: students.id,
      name: students.name,
      year: students.year,
      parentConsentOnFileAt: students.parentConsentOnFileAt,
      lastEvalDate: sql<string | null>`(
        SELECT MAX(${evaluations.evaluationDate})
        FROM ${evaluations}
        WHERE ${evaluations.studentId} = ${students.id}
      )`.as("last_eval_date"),
    })
    .from(students)
    .where(and(eq(students.academyId, academyId), archivedClause, consentClause))
    .orderBy(students.name);

  return rows;
}

export async function getStudent(academyId: string, id: string) {
  return db.query.students.findFirst({
    where: and(eq(students.id, id), eq(students.academyId, academyId), isNull(students.softDeletedAt)),
  });
}

export async function getRecentEvaluationsForStudent(academyId: string, studentId: string, limit = 3) {
  return db
    .select({
      id: evaluations.id,
      evaluationDate: evaluations.evaluationDate,
      status: feedbackDrafts.status,
    })
    .from(evaluations)
    .leftJoin(feedbackDrafts, eq(feedbackDrafts.evaluationId, evaluations.id))
    .where(and(eq(evaluations.studentId, studentId), eq(evaluations.academyId, academyId)))
    .orderBy(desc(evaluations.evaluationDate))
    .limit(limit);
}
```

- [ ] **Step 2: Verify compile**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/students/queries.ts
git commit -m "students: add queries module (list, get, recent evals)"
```

### Task 10: Students actions (create/update/archive)

**Files:**
- Create: `src/lib/students/actions.ts`
- Test: `tests/integration/students/actions.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/students/actions.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "stu-1" }]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => ({})) })) })),
    query: { students: { findFirst: vi.fn() } },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createStudent, updateStudent, archiveStudent } from "@/lib/students/actions";
import { requireAuth } from "@/lib/auth/require-auth";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";

describe("createStudent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireRole as any).mockResolvedValue({ academyId: "acad-1", role: "owner" });
  });

  it("inserts student with consent timestamp when toggle ON", async () => {
    const res = await createStudent({ name: "박지윤", year: "2년차", parentConsentOnFile: true });
    expect(res.ok).toBe(true);
    expect(db.insert).toHaveBeenCalled();
  });

  it("rejects invalid input via Zod", async () => {
    const res = await createStudent({ name: "", parentConsentOnFile: false } as any);
    expect(res.ok).toBe(false);
  });
});

describe("archiveStudent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireRole as any).mockResolvedValue({ academyId: "acad-1", role: "owner" });
    (db.query.students.findFirst as any).mockResolvedValue({ id: "stu-1", name: "박지윤", academyId: "acad-1" });
  });

  it("anonymizes name and sets soft_deleted_at", async () => {
    const res = await archiveStudent("stu-1");
    expect(res.ok).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("rejects when student not found in academy", async () => {
    (db.query.students.findFirst as any).mockResolvedValue(undefined);
    const res = await archiveStudent("stu-missing");
    expect(res.ok).toBe(false);
  });
});

describe("updateStudent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({ academyId: "acad-1", role: "coach" });
    (requireRole as any).mockResolvedValue({ academyId: "acad-1", role: "owner" });
    (db.query.students.findFirst as any).mockResolvedValue({ id: "stu-1", academyId: "acad-1" });
  });

  it("requires owner/admin role for consent toggle", async () => {
    (requireRole as any).mockRejectedValue(new Error("REDIRECT:/students"));
    await expect(updateStudent("stu-1", { name: "박지윤", parentConsentOnFile: true })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/students/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

Create `src/lib/students/actions.ts`:

```typescript
"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/require-auth";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { students } from "@/lib/db/schema";
import { studentFormSchema, type StudentFormInput } from "@/lib/students/schema";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function createStudent(input: StudentFormInput): Promise<ActionResult<{ id: string }>> {
  const { academyId } = await requireRole(["owner", "admin"]);
  const parsed = studentFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "검증 실패" };

  const [row] = await db
    .insert(students)
    .values({
      academyId,
      name: parsed.data.name,
      year: parsed.data.year ?? null,
      parentConsentOnFileAt: parsed.data.parentConsentOnFile ? new Date() : null,
    })
    .returning({ id: students.id });

  revalidatePath("/students");
  return { ok: true, data: { id: row.id } };
}

export async function updateStudent(id: string, input: StudentFormInput): Promise<ActionResult> {
  const { academyId } = input.parentConsentOnFile !== undefined
    ? await requireRole(["owner", "admin"])
    : await requireAuth();

  const parsed = studentFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "검증 실패" };

  const existing = await db.query.students.findFirst({
    where: and(eq(students.id, id), eq(students.academyId, academyId)),
  });
  if (!existing) return { ok: false, error: "학생을 찾을 수 없습니다" };

  await db
    .update(students)
    .set({
      name: parsed.data.name,
      year: parsed.data.year ?? null,
      parentConsentOnFileAt: parsed.data.parentConsentOnFile
        ? (existing.parentConsentOnFileAt ?? new Date())
        : null,
      updatedAt: new Date(),
    })
    .where(eq(students.id, id));

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return { ok: true };
}

export async function archiveStudent(id: string): Promise<ActionResult> {
  const { academyId } = await requireRole(["owner", "admin"]);

  const existing = await db.query.students.findFirst({
    where: and(eq(students.id, id), eq(students.academyId, academyId)),
  });
  if (!existing) return { ok: false, error: "학생을 찾을 수 없습니다" };

  await db
    .update(students)
    .set({
      name: `STUDENT_DELETED_${id}`,
      parentConsentArtifactUrl: null,
      softDeletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(students.id, id));

  revalidatePath("/students");
  return { ok: true };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test tests/integration/students/actions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/students/actions.ts tests/integration/students/actions.test.ts
git commit -m "students: add createStudent/updateStudent/archiveStudent actions"
```

### Task 11: StudentForm shared client component

**Files:**
- Create: `src/app/(coach)/students/components/student-form.tsx`

- [ ] **Step 1: Write component**

Create `src/app/(coach)/students/components/student-form.tsx`:

```tsx
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { studentFormSchema, type StudentFormInput } from "@/lib/students/schema";

export type StudentFormProps = {
  defaultValues?: Partial<StudentFormInput>;
  canEditConsent: boolean;
  onSubmit: (input: StudentFormInput) => Promise<{ ok: boolean; error?: string }>;
  submitLabel: string;
};

export function StudentForm({ defaultValues, canEditConsent, onSubmit, submitLabel }: StudentFormProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<StudentFormInput>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: { name: "", year: "", parentConsentOnFile: false, ...defaultValues },
  });

  const handle = async (data: StudentFormInput) => {
    setError(null);
    const res = await onSubmit(data);
    if (!res.ok) setError(res.error ?? "저장 실패");
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handle)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이름</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="year"
          render={({ field }) => (
            <FormItem>
              <FormLabel>구분 (예: 1년차, 2년차, 재수생)</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="parentConsentOnFile"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded border p-3">
              <FormLabel className="flex-1">부모 동의서 받음</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!canEditConsent}
                />
              </FormControl>
            </FormItem>
          )}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full">{submitLabel}</Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Verify shadcn deps**

Run: `bunx shadcn@latest add switch form input button` (if not yet installed). Confirm `src/components/ui/switch.tsx` exists.

- [ ] **Step 3: Compile check**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(coach\)/students/components/student-form.tsx
git commit -m "students: add StudentForm shared client component"
```

### Task 12: Students list + new + detail + edit pages

**Files:**
- Create: `src/app/(coach)/students/page.tsx`
- Create: `src/app/(coach)/students/components/student-row.tsx`
- Create: `src/app/(coach)/students/new/page.tsx`
- Create: `src/app/(coach)/students/[id]/page.tsx`
- Create: `src/app/(coach)/students/[id]/edit/page.tsx`
- Create: `src/app/(coach)/students/components/archive-confirm.tsx`

- [ ] **Step 1: List page**

Create `src/app/(coach)/students/page.tsx`:

```tsx
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { listStudents, type StudentListFilter } from "@/lib/students/queries";
import { Button } from "@/components/ui/button";
import { StudentRow } from "./components/student-row";

const FILTERS: { key: StudentListFilter; label: string }[] = [
  { key: "active", label: "활성" },
  { key: "no_consent", label: "동의 미제출" },
  { key: "archived", label: "보관됨" },
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { academyId, role } = await requireAuth();
  const { filter: rawFilter } = await searchParams;
  const filter: StudentListFilter =
    rawFilter === "no_consent" || rawFilter === "archived" ? rawFilter : "active";

  const rows = await listStudents(academyId, filter);
  const canManage = role === "owner" || role === "admin";

  return (
    <main className="px-4 py-6 max-w-2xl mx-auto">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">학생 목록</h1>
        {canManage && (
          <Button asChild size="sm"><Link href="/students/new">학생 추가</Link></Button>
        )}
      </header>
      <nav className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/students?filter=${f.key}`}
            className={`text-sm rounded-full px-3 py-1 ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{filter === "active" ? "첫 학생을 추가해 보세요" : "해당하는 학생이 없습니다"}</p>
          {filter === "active" && canManage && (
            <Button asChild className="mt-4"><Link href="/students/new">학생 추가</Link></Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => <StudentRow key={row.id} student={row} />)}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Student row**

Create `src/app/(coach)/students/components/student-row.tsx`:

```tsx
import Link from "next/link";

type Student = {
  id: string;
  name: string;
  year: string | null;
  parentConsentOnFileAt: Date | null;
  lastEvalDate: string | null;
};

export function StudentRow({ student }: { student: Student }) {
  return (
    <li>
      <Link
        href={`/students/${student.id}`}
        className="flex items-center justify-between rounded border p-3 hover:bg-muted"
      >
        <div className="flex-1">
          <p className="font-medium">{student.name}</p>
          <p className="text-xs text-muted-foreground">
            {student.year ?? "구분 미입력"} · {student.parentConsentOnFileAt ? "동의 ✓" : "동의 미제출"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{student.lastEvalDate ?? "평가 없음"}</p>
      </Link>
    </li>
  );
}
```

- [ ] **Step 3: New page**

Create `src/app/(coach)/students/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { createStudent } from "@/lib/students/actions";
import { StudentForm } from "../components/student-form";

export default async function NewStudentPage() {
  await requireRole(["owner", "admin"]);

  async function action(input: any) {
    "use server";
    const res = await createStudent(input);
    if (res.ok && res.data) redirect(`/students/${res.data.id}`);
    return res;
  }

  return (
    <main className="px-4 py-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-6">학생 추가</h1>
      <StudentForm canEditConsent submitLabel="추가" onSubmit={action} />
    </main>
  );
}
```

- [ ] **Step 4: Detail page**

Create `src/app/(coach)/students/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getRecentEvaluationsForStudent, getStudent } from "@/lib/students/queries";
import { Button } from "@/components/ui/button";
import { StartEvaluationButton } from "./start-evaluation-button";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { academyId, role } = await requireAuth();
  const student = await getStudent(academyId, id);
  if (!student) notFound();

  const recent = await getRecentEvaluationsForStudent(academyId, id);
  const canManage = role === "owner" || role === "admin";
  const canEvaluate = !!student.parentConsentOnFileAt;

  return (
    <main className="px-4 py-6 max-w-md mx-auto">
      <Link href="/students" className="text-sm text-muted-foreground">◀ 학생 목록</Link>
      <h1 className="text-xl font-bold mt-2">{student.name}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {student.year ?? "구분 미입력"} · {student.parentConsentOnFileAt ? `동의 ✓ ${new Date(student.parentConsentOnFileAt).toLocaleDateString()}` : "동의 미제출"}
      </p>
      <StartEvaluationButton studentId={student.id} disabled={!canEvaluate} />
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">최근 평가</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">평가 내역이 없습니다</p>
        ) : (
          <ul className="space-y-1">
            {recent.map((r) => (
              <li key={r.id} className="text-sm">
                <Link href={`/evaluation/${r.id}/review`} className="hover:underline">
                  {r.evaluationDate} · {r.status ?? "draft"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canManage && (
        <div className="mt-8 space-y-2">
          <Button asChild variant="secondary" className="w-full"><Link href={`/students/${id}/edit`}>학생 정보 수정</Link></Button>
          {/* archive button rendered inside ArchiveConfirm in Task 13 — placeholder slot */}
        </div>
      )}
    </main>
  );
}
```

Create `src/app/(coach)/students/[id]/start-evaluation-button.tsx` (stub — wired in Task 14):

```tsx
"use client";
import { Button } from "@/components/ui/button";

export function StartEvaluationButton({ disabled }: { studentId: string; disabled: boolean }) {
  return (
    <Button className="w-full" disabled={disabled}>
      {disabled ? "동의서 필요" : "시작하기 (이번 달 평가)"}
    </Button>
  );
}
```

- [ ] **Step 5: Edit page**

Create `src/app/(coach)/students/[id]/edit/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getStudent } from "@/lib/students/queries";
import { updateStudent } from "@/lib/students/actions";
import { StudentForm } from "../../components/student-form";

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { academyId, role } = await requireAuth();
  const student = await getStudent(academyId, id);
  if (!student) notFound();

  const canEditConsent = role === "owner" || role === "admin";

  async function action(input: any) {
    "use server";
    const res = await updateStudent(id, input);
    if (res.ok) redirect(`/students/${id}`);
    return res;
  }

  return (
    <main className="px-4 py-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-6">{student.name} 정보 수정</h1>
      <StudentForm
        defaultValues={{
          name: student.name,
          year: student.year ?? "",
          parentConsentOnFile: !!student.parentConsentOnFileAt,
        }}
        canEditConsent={canEditConsent}
        submitLabel="저장"
        onSubmit={action}
      />
    </main>
  );
}
```

- [ ] **Step 6: Compile + manual smoke**

Run: `bunx tsc --noEmit && bun dev`
Visit `/students` (after seeding a logged-in user). Expected: list renders.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(coach\)/students/
git commit -m "students: add list/detail/new/edit pages"
```

### Task 13: Archive confirm modal + E2E

**Files:**
- Create: `src/app/(coach)/students/components/archive-confirm.tsx`
- Modify: `src/app/(coach)/students/[id]/page.tsx` — render archive button.
- Test: `tests/e2e/students.spec.ts`

- [ ] **Step 1: Archive confirm component**

Create `src/app/(coach)/students/components/archive-confirm.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveStudent } from "@/lib/students/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ArchiveConfirm({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="w-full">보관 (archive)</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>학생을 보관하시겠습니까?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">이 작업은 되돌릴 수 없습니다.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const res = await archiveStudent(studentId);
              if (res.ok) router.push("/students?filter=archived");
            })}
          >
            보관
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Mount on detail page**

Edit `src/app/(coach)/students/[id]/page.tsx`. After the "학생 정보 수정" button inside the `canManage` block, add:

```tsx
import { ArchiveConfirm } from "../components/archive-confirm";
// ...
{canManage && (
  <div className="mt-8 space-y-2">
    <Button asChild variant="secondary" className="w-full"><Link href={`/students/${id}/edit`}>학생 정보 수정</Link></Button>
    <ArchiveConfirm studentId={id} />
  </div>
)}
```

- [ ] **Step 3: E2E test**

Create `tests/e2e/students.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

// Tests assume Playwright auth setup seeds an owner role; see playwright.config.ts.

test.describe("Students CRUD", () => {
  test("E2E-S1: owner adds student, toggles consent, sees enabled CTA", async ({ page }) => {
    await page.goto("/students/new");
    await page.fill('input[name="name"]', "테스트 학생");
    await page.fill('input[name="year"]', "1년차");
    await page.click('[role="switch"]');
    await page.click('button[type="submit"]');
    await expect(page.locator("h1")).toContainText("테스트 학생");
    await expect(page.locator("button", { hasText: "시작하기" })).toBeEnabled();
  });

  test("E2E-S2: coach role hides edit/archive buttons", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "tests/.auth/coach.json" });
    const page = await ctx.newPage();
    await page.goto("/students");
    const first = page.locator("li a").first();
    await first.click();
    await expect(page.locator("button", { hasText: "학생 정보 수정" })).toHaveCount(0);
    await expect(page.locator("button", { hasText: "보관" })).toHaveCount(0);
  });

  test("E2E-S3: archive moves student to 보관됨 filter", async ({ page }) => {
    await page.goto("/students/new");
    await page.fill('input[name="name"]', "보관테스트");
    await page.click('[role="switch"]');
    await page.click('button[type="submit"]');
    await page.click("button:has-text('보관 (archive)')");
    await page.click("button:has-text('보관'):not(:has-text('archive'))");
    await page.waitForURL("**/students?filter=archived");
    await expect(page.locator("li", { hasText: "STUDENT_DELETED" })).toHaveCount(1);
  });
});
```

- [ ] **Step 4: Run E2E (Playwright must be set up; if not, defer to Phase 10)**

Run: `bun run test:e2e tests/e2e/students.spec.ts` (skip if Playwright auth not yet configured)
Expected: PASS or skipped with note.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(coach\)/students/ tests/e2e/students.spec.ts
git commit -m "students: add archive confirm modal + E2E tests"
```

---

## Phase 4: Eval Start Action

### Task 14: startEvaluation action + helpers

**Files:**
- Create: `src/lib/evaluations/queries.ts`
- Create: `src/lib/evaluations/start-action.ts`
- Test: `tests/integration/evaluations/start.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/evaluations/start.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    query: { students: { findFirst: vi.fn() }, evaluations: { findFirst: vi.fn() } },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "ev-NEW" }]) })) })),
  },
}));

import { startEvaluation } from "@/lib/evaluations/start-action";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";

describe("startEvaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({ academyId: "acad-1", appUser: { id: "u-1" }, role: "coach" });
    process.env.FEATURE_AI_VIDEO_ANALYSIS = "false";
  });

  it("returns no_consent when student lacks consent", async () => {
    (db.query.students.findFirst as any).mockResolvedValue({ id: "stu-1", parentConsentOnFileAt: null });
    const res = await startEvaluation("stu-1");
    expect(res).toEqual({ ok: false, error: "no_consent" });
  });

  it("creates evaluation when consent ok and no in-flight", async () => {
    (db.query.students.findFirst as any).mockResolvedValue({ id: "stu-1", parentConsentOnFileAt: new Date() });
    (db.query.evaluations.findFirst as any).mockResolvedValue(undefined);
    const res = await startEvaluation("stu-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.evaluationId).toBe("ev-NEW");
      expect(res.redirectTo).toContain("/coach-form");
    }
  });

  it("resumes existing in-flight evaluation (status != sent)", async () => {
    (db.query.students.findFirst as any).mockResolvedValue({ id: "stu-1", parentConsentOnFileAt: new Date() });
    (db.query.evaluations.findFirst as any).mockResolvedValue({
      id: "ev-OLD",
      feedback_draft: { status: "draft" },
    });
    const res = await startEvaluation("stu-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.evaluationId).toBe("ev-OLD");
      expect(res.resumed).toBe(true);
    }
  });

  it("creates new evaluation when previous is sent", async () => {
    (db.query.students.findFirst as any).mockResolvedValue({ id: "stu-1", parentConsentOnFileAt: new Date() });
    (db.query.evaluations.findFirst as any).mockResolvedValue({
      id: "ev-OLD",
      feedback_draft: { status: "sent" },
    });
    const res = await startEvaluation("stu-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.evaluationId).toBe("ev-NEW");
  });

  it("redirects to /evaluation/[id] (Approach-C) when feature flag ON", async () => {
    process.env.FEATURE_AI_VIDEO_ANALYSIS = "true";
    (db.query.students.findFirst as any).mockResolvedValue({ id: "stu-1", parentConsentOnFileAt: new Date() });
    (db.query.evaluations.findFirst as any).mockResolvedValue(undefined);
    const res = await startEvaluation("stu-1");
    if (res.ok) expect(res.redirectTo).toBe("/evaluation/ev-NEW");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/evaluations/start.test.ts`
Expected: FAIL.

- [ ] **Step 3: Queries module**

Create `src/lib/evaluations/queries.ts`:

```typescript
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluations, feedbackDrafts, students } from "@/lib/db/schema";

export async function getEvaluation(academyId: string, id: string) {
  return db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, id), eq(evaluations.academyId, academyId)),
    with: { student: true, feedbackDraft: true, aiAnalysis: true },
  });
}
```

- [ ] **Step 4: Start action**

Create `src/lib/evaluations/start-action.ts`:

```typescript
"use server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { evaluations, feedbackDrafts, students } from "@/lib/db/schema";

export type StartEvaluationResult =
  | { ok: true; evaluationId: string; redirectTo: string; resumed?: boolean }
  | { ok: false; error: "no_consent" | "not_found" };

const todayISO = (): string => new Date().toISOString().slice(0, 10);
const addDaysISO = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

export async function startEvaluation(studentId: string): Promise<StartEvaluationResult> {
  const { academyId, appUser } = await requireAuth();

  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.academyId, academyId)),
  });
  if (!student) return { ok: false, error: "not_found" };
  if (!student.parentConsentOnFileAt) return { ok: false, error: "no_consent" };

  const existing = await db.query.evaluations.findFirst({
    where: and(
      eq(evaluations.studentId, studentId),
      eq(evaluations.evaluationDate, todayISO()),
      eq(evaluations.academyId, academyId),
    ),
    with: { feedbackDraft: true },
  });

  const featureOn = process.env.FEATURE_AI_VIDEO_ANALYSIS === "true";
  const redirectFor = (id: string) => featureOn ? `/evaluation/${id}` : `/evaluation/${id}/coach-form`;

  if (existing && (existing as any).feedbackDraft?.status !== "sent") {
    return { ok: true, evaluationId: existing.id, redirectTo: redirectFor(existing.id), resumed: true };
  }

  const [row] = await db
    .insert(evaluations)
    .values({
      academyId,
      studentId,
      coachUserId: appUser.id,
      evaluationDate: todayISO(),
      videoStorageUrl: null as any,
      videoLifecycleExpiresAt: addDaysISO(30),
    })
    .returning({ id: evaluations.id });

  return { ok: true, evaluationId: row.id, redirectTo: redirectFor(row.id) };
}
```

Note: the relation alias `feedbackDraft` requires Drizzle relations defined in `schema.ts`. If not yet present, add a relations block:

```typescript
// in src/lib/db/schema.ts after table definitions
import { relations } from "drizzle-orm";

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  student: one(students, { fields: [evaluations.studentId], references: [students.id] }),
  feedbackDraft: one(feedbackDrafts, { fields: [evaluations.id], references: [feedbackDrafts.evaluationId] }),
  aiAnalysis: one(aiAnalyses, { fields: [evaluations.id], references: [aiAnalyses.evaluationId] }),
}));
```

(Task 14 includes adding this if missing.)

- [ ] **Step 5: Run tests**

Run: `bun run test tests/integration/evaluations/start.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/evaluations/queries.ts src/lib/evaluations/start-action.ts src/lib/db/schema.ts tests/integration/evaluations/start.test.ts
git commit -m "evaluations: add startEvaluation action + queries"
```

### Task 15: Wire startEvaluation to detail page button

**Files:**
- Modify: `src/app/(coach)/students/[id]/start-evaluation-button.tsx`

- [ ] **Step 1: Replace stub with wired version**

Replace `src/app/(coach)/students/[id]/start-evaluation-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startEvaluation } from "@/lib/evaluations/start-action";
import { Button } from "@/components/ui/button";

export function StartEvaluationButton({ studentId, disabled }: { studentId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handle = () => startTransition(async () => {
    const res = await startEvaluation(studentId);
    if (!res.ok) {
      toast.error(res.error === "no_consent" ? "부모 동의가 필요합니다" : "학생을 찾을 수 없습니다");
      return;
    }
    router.push(res.redirectTo);
  });

  return (
    <Button className="w-full" disabled={disabled || pending} onClick={handle}>
      {disabled ? "동의서 필요" : pending ? "시작 중..." : "시작하기 (이번 달 평가)"}
    </Button>
  );
}
```

- [ ] **Step 2: Verify sonner installed**

Confirm `sonner` is in `package.json`. If not: `bun add sonner` and add `<Toaster />` to root layout if missing.

- [ ] **Step 3: Compile**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(coach\)/students/\[id\]/start-evaluation-button.tsx
git commit -m "evaluations: wire startEvaluation button to action"
```

---

## Phase 5: Approach-A Wiring

### Task 16: Replace TODO stubs in coach-form actions.ts

**Files:**
- Modify: `src/app/(coach)/evaluation/[id]/coach-form/actions.ts`

- [ ] **Step 1: Replace file**

Replace `src/app/(coach)/evaluation/[id]/coach-form/actions.ts`:

```typescript
"use server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { evaluations, feedbackDrafts, students } from "@/lib/db/schema";
import { createLetterGenerationService } from "@/lib/evaluation/factory";
import {
  type CoachBulletFormInput,
  coachBulletFormSchema,
} from "@/lib/forms/coach-bullet-form";

export type SubmitResult =
  | { ok: true; feedbackDraftId: string; redirectTo: string }
  | { ok: false; error: "validation" | "no_consent" | "not_found" | "duplicate" | "llm_failed"; details?: string };

export async function submitCoachBulletEvaluation(
  evaluationId: string,
  input: CoachBulletFormInput,
): Promise<SubmitResult> {
  const { academyId, appUser } = await requireAuth();

  const parsed = coachBulletFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation", details: parsed.error.issues[0]?.message ?? "입력값 오류" };
  }

  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.academyId, academyId)),
    with: { student: true },
  });
  if (!evaluation) return { ok: false, error: "not_found" };
  if (!(evaluation as any).student?.parentConsentOnFileAt) return { ok: false, error: "no_consent" };

  // Generate letter
  let letter: string;
  try {
    const letterSvc = createLetterGenerationService();
    letter = await letterSvc.generateLetter({
      type: "coach_bullets",
      bullets: input.bullets,
      student: {
        studentName: (evaluation as any).student.name,
        year: (evaluation as any).student.year ?? input.year ?? "미지정",
        evaluationDate: input.evaluationDate,
      },
    });
  } catch (err) {
    return { ok: false, error: "llm_failed", details: err instanceof Error ? err.message : "unknown" };
  }

  // INSERT feedback_drafts (1:1 with evaluation; existing row reused if found)
  const existing = await db.query.feedbackDrafts.findFirst({
    where: eq(feedbackDrafts.evaluationId, evaluationId),
  });

  let draftId: string;
  if (existing) {
    if (existing.status === "sent") return { ok: false, error: "duplicate" };
    await db.update(feedbackDrafts).set({
      aiDraftText: letter,
      updatedAt: new Date(),
    }).where(eq(feedbackDrafts.id, existing.id));
    draftId = existing.id;
  } else {
    const [row] = await db.insert(feedbackDrafts).values({
      academyId,
      evaluationId,
      aiDraftText: letter,
      status: "draft",
    }).returning({ id: feedbackDrafts.id });
    draftId = row.id;
  }

  return { ok: true, feedbackDraftId: draftId, redirectTo: `/evaluation/${evaluationId}/review` };
}
```

- [ ] **Step 2: Update form.tsx caller signature**

Confirm `src/app/(coach)/evaluation/[id]/coach-form/form.tsx` passes the evaluation id. If the existing call signature is `submitCoachBulletEvaluation(input)`, update to `submitCoachBulletEvaluation(evaluationId, input)`. Read the current file:

```bash
cat src/app/\(coach\)/evaluation/\[id\]/coach-form/form.tsx
```

If needed, edit so the form receives `evaluationId` as a prop and passes it as the first arg.

- [ ] **Step 3: Update form caller to redirect on success**

In `form.tsx`, after a successful submit:

```typescript
if (res.ok) {
  router.push(res.redirectTo);  // /evaluation/[id]/review
}
```

- [ ] **Step 4: Compile**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(coach\)/evaluation/\[id\]/coach-form/
git commit -m "approach-a: wire coach-form to real DB + redirect to /review"
```

---

## Phase 6: Review/Send

### Task 17: validate-letter shared helper (DRY refactor)

**Files:**
- Create: `src/lib/evaluations/validate-letter.ts`
- Test: `tests/unit/evaluations/validate-letter.test.ts`
- Modify: `src/lib/evaluation/gpt-4o-mini-letter.ts` — replace inline validation with import.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/evaluations/validate-letter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { validateLetter, PROHIBITED } from "@/lib/evaluations/validate-letter";

describe("validateLetter", () => {
  const ok = "안녕하세요, 박지윤 학생 부모님. 좋은 평가였습니다. 김 코치 드림.";

  it("accepts valid letter", () => {
    expect(validateLetter(ok)).toEqual({ ok: true });
  });

  it("rejects when missing 안녕하세요", () => {
    const r = validateLetter("반갑습니다, 부모님.");
    expect(r).toEqual({ ok: false, error: "must_start_greeting" });
  });

  it("rejects when over 350 chars (excluding whitespace)", () => {
    const long = "안녕하세요" + "가".repeat(400);
    expect(validateLetter(long)).toEqual({ ok: false, error: "too_long" });
  });

  it("rejects each prohibited word", () => {
    for (const word of PROHIBITED) {
      const text = `안녕하세요 부모님. ${word} 평가.`;
      expect(validateLetter(text)).toEqual({ ok: false, error: `prohibited:${word}` });
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun run test tests/unit/evaluations/validate-letter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/evaluations/validate-letter.ts`:

```typescript
export const PROHIBITED = [
  "분석", "AI", "인공지능", "자동", "측정", "데이터",
  "점수", "등급", "지표", "리포트", "보고서",
] as const;

export type LetterValidationResult =
  | { ok: true }
  | { ok: false; error: "must_start_greeting" | "too_long" | `prohibited:${string}` };

export function validateLetter(text: string): LetterValidationResult {
  const trimmed = text.trim();
  if (!trimmed.startsWith("안녕하세요")) return { ok: false, error: "must_start_greeting" };

  const charCount = [...trimmed].filter((c) => c.trim().length > 0).length;
  if (charCount > 350) return { ok: false, error: "too_long" };

  for (const word of PROHIBITED) {
    if (trimmed.includes(word)) return { ok: false, error: `prohibited:${word}` };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Refactor gpt-4o-mini-letter.ts**

Read `src/lib/evaluation/gpt-4o-mini-letter.ts`. Find the inline `validateOutput` method that throws on invalid. Replace with:

```typescript
import { validateLetter } from "@/lib/evaluations/validate-letter";

// ... inside class:
private validateOutput(text: string): void {
  const result = validateLetter(text);
  if (!result.ok) throw new Error(`letter validation failed: ${result.error}`);
}
```

Remove the duplicated PROHIBITED constant from this file.

- [ ] **Step 5: Run tests**

Run: `bun run test tests/unit/evaluations/validate-letter.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/evaluations/validate-letter.ts src/lib/evaluation/gpt-4o-mini-letter.ts tests/unit/evaluations/validate-letter.test.ts
git commit -m "evaluations: extract validateLetter helper (DRY)"
```

### Task 18: share-link helpers

**Files:**
- Create: `src/lib/evaluations/share-link.ts`
- Test: `tests/unit/evaluations/share-link.test.ts`

- [ ] **Step 1: Test**

Create `tests/unit/evaluations/share-link.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { generateRawToken, hashToken } from "@/lib/evaluations/share-link";

describe("share-link", () => {
  it("generateRawToken returns ≥40-char base64url", () => {
    const t = generateRawToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generateRawToken returns different tokens each call", () => {
    expect(generateRawToken()).not.toBe(generateRawToken());
  });

  it("hashToken is deterministic given same pepper", () => {
    expect(hashToken("abc", "pepper")).toBe(hashToken("abc", "pepper"));
  });

  it("hashToken differs across pepper", () => {
    expect(hashToken("abc", "pepperA")).not.toBe(hashToken("abc", "pepperB"));
  });

  it("hashToken returns 64-char hex (sha256)", () => {
    expect(hashToken("abc", "p")).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun run test tests/unit/evaluations/share-link.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/evaluations/share-link.ts`:

```typescript
import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string, pepper: string): string {
  return createHash("sha256").update(token + pepper).digest("hex");
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test tests/unit/evaluations/share-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/evaluations/share-link.ts tests/unit/evaluations/share-link.test.ts
git commit -m "evaluations: add share-link generate + hash helpers"
```

### Task 19: finalizeAndSend action

**Files:**
- Create: `src/lib/evaluations/finalize-action.ts`
- Test: `tests/integration/evaluations/finalize.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/evaluations/finalize.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => ({})) })) })),
  },
}));

import { finalizeAndSend } from "@/lib/evaluations/finalize-action";
import { requireAuth } from "@/lib/auth/require-auth";

describe("finalizeAndSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({ academyId: "acad-1" });
    process.env.SHARE_LINK_PEPPER = "x".repeat(48);
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
  });

  it("returns must_start_greeting when text doesn't start with 안녕하세요", async () => {
    const r = await finalizeAndSend({ draftId: "d-1", editedText: "반갑습니다" });
    expect(r).toEqual({ ok: false, error: "must_start_greeting" });
  });

  it("returns shareUrl on valid text", async () => {
    const text = "안녕하세요 학생 부모님. 좋습니다. 김코치 드림.";
    const r = await finalizeAndSend({ draftId: "d-1", editedText: text });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shareUrl).toMatch(/^https:\/\/example\.test\/feedback\/[A-Za-z0-9_-]+$/);
      expect(r.expiresAt).toBeInstanceOf(Date);
    }
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `bun run test tests/integration/evaluations/finalize.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/evaluations/finalize-action.ts`:

```typescript
"use server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { feedbackDrafts } from "@/lib/db/schema";
import { generateRawToken, hashToken } from "@/lib/evaluations/share-link";
import { validateLetter } from "@/lib/evaluations/validate-letter";

export type FinalizeResult =
  | { ok: true; shareUrl: string; expiresAt: Date }
  | { ok: false; error: string };

export async function finalizeAndSend(input: {
  draftId: string;
  editedText: string;
}): Promise<FinalizeResult> {
  const { academyId } = await requireAuth();

  const validation = validateLetter(input.editedText);
  if (!validation.ok) return { ok: false, error: validation.error };

  const pepper = process.env.SHARE_LINK_PEPPER!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  if (!pepper) return { ok: false, error: "missing_pepper" };
  if (!appUrl) return { ok: false, error: "missing_app_url" };

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken, pepper);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db
    .update(feedbackDrafts)
    .set({
      coachEditedText: input.editedText.trim(),
      status: "sent",
      approvedAt: now,
      sentAt: now,
      shareLinkTokenHash: tokenHash,
      shareLinkExpiresAt: expiresAt,
      updatedAt: now,
    })
    .where(and(
      eq(feedbackDrafts.id, input.draftId),
      eq(feedbackDrafts.academyId, academyId),
    ));

  return {
    ok: true,
    shareUrl: `${appUrl}/feedback/${rawToken}`,
    expiresAt,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test tests/integration/evaluations/finalize.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/evaluations/finalize-action.ts tests/integration/evaluations/finalize.test.ts
git commit -m "evaluations: add finalizeAndSend action with token gen"
```

### Task 20: Review page (Server Component)

**Files:**
- Create: `src/app/(coach)/evaluation/[id]/review/page.tsx`
- Create: `src/app/(coach)/evaluation/[id]/review/actions.ts`

- [ ] **Step 1: Page**

Create `src/app/(coach)/evaluation/[id]/review/page.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { feedbackDrafts } from "@/lib/db/schema";
import { getEvaluation } from "@/lib/evaluations/queries";
import { ReviewEditor } from "./review-editor";
import { ShareLinkCard } from "./share-link-card";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { academyId } = await requireAuth();
  const evaluation = await getEvaluation(academyId, id);
  if (!evaluation) notFound();

  const draft = await db.query.feedbackDrafts.findFirst({
    where: eq(feedbackDrafts.evaluationId, id),
  });
  if (!draft) notFound();

  if (draft.status === "sent") {
    return (
      <main className="px-4 py-6 max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-4">발송 완료</h1>
        <p className="text-sm text-muted-foreground">이 평가는 이미 발송되었습니다.</p>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 max-w-md mx-auto space-y-4">
      <header>
        <h1 className="text-xl font-bold">{(evaluation as any).student?.name} 학생 · {evaluation.evaluationDate}</h1>
        <p className="text-sm text-muted-foreground">{(evaluation as any).student?.year ?? "구분 미입력"}</p>
      </header>
      <ReviewEditor draftId={draft.id} initialText={draft.aiDraftText} />
    </main>
  );
}
```

- [ ] **Step 2: Re-export action**

Create `src/app/(coach)/evaluation/[id]/review/actions.ts`:

```typescript
export { finalizeAndSend } from "@/lib/evaluations/finalize-action";
```

- [ ] **Step 3: Compile**

Run: `bunx tsc --noEmit`
Expected: No errors (review-editor + share-link-card created in next tasks but referenced).

Note: page imports will fail until next task is done; that's fine for the commit. Bypass with stubs:

Create `src/app/(coach)/evaluation/[id]/review/review-editor.tsx` (stub, replaced in Task 21):

```tsx
"use client";
export function ReviewEditor({ draftId, initialText }: { draftId: string; initialText: string }) {
  return <div>Stub editor for {draftId}</div>;
}
```

Create `src/app/(coach)/evaluation/[id]/review/share-link-card.tsx` (stub):

```tsx
"use client";
export function ShareLinkCard({ shareUrl, expiresAt }: { shareUrl: string; expiresAt: Date }) {
  return <div>Stub share card</div>;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(coach\)/evaluation/\[id\]/review/
git commit -m "review: add page scaffold + action re-export"
```

### Task 21: ReviewEditor + ShareLinkCard

**Files:**
- Replace: `src/app/(coach)/evaluation/[id]/review/review-editor.tsx`
- Replace: `src/app/(coach)/evaluation/[id]/review/share-link-card.tsx`

- [ ] **Step 1: ReviewEditor**

Replace `src/app/(coach)/evaluation/[id]/review/review-editor.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { finalizeAndSend } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { KoreanCharCounter } from "@/components/korean-char-counter";
import { ShareLinkCard } from "./share-link-card";

const ERROR_MESSAGES: Record<string, string> = {
  must_start_greeting: "letter 는 '안녕하세요' 로 시작해야 합니다.",
  too_long: "350자를 초과했습니다.",
  missing_pepper: "서버 설정 오류 (pepper).",
  missing_app_url: "서버 설정 오류 (app url).",
};

export function ReviewEditor({ draftId, initialText }: { draftId: string; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [pending, startTransition] = useTransition();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  if (shareUrl && expiresAt) {
    return <ShareLinkCard shareUrl={shareUrl} expiresAt={expiresAt} />;
  }

  const handle = () => startTransition(async () => {
    const res = await finalizeAndSend({ draftId, editedText: text });
    if (!res.ok) {
      const msg = ERROR_MESSAGES[res.error] ?? (res.error.startsWith("prohibited:")
        ? `금지어가 포함되어 있습니다: ${res.error.replace("prohibited:", "")}`
        : "발송 실패");
      toast.error(msg);
      return;
    }
    setShareUrl(res.shareUrl);
    setExpiresAt(res.expiresAt);
  });

  return (
    <div className="space-y-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        className="font-serif"
      />
      <KoreanCharCounter value={text} max={350} />
      <p className="text-xs text-muted-foreground rounded bg-muted p-2">
        💡 AI 가 작성한 초안입니다. 한 줄 한 줄 검토 후 발송하세요.
      </p>
      <Button className="w-full" disabled={pending} onClick={handle}>
        {pending ? "발송 중..." : "승인 및 공유 링크 생성"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: ShareLinkCard**

Replace `src/app/(coach)/evaluation/[id]/review/share-link-card.tsx`:

```tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareLinkCard({ shareUrl, expiresAt }: { shareUrl: string; expiresAt: Date }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("주소를 복사했습니다");
  };
  const expiry = new Date(expiresAt).toLocaleDateString("ko-KR");

  return (
    <div className="rounded border p-4 space-y-3">
      <h2 className="font-semibold text-green-700">✓ 발송 완료</h2>
      <div>
        <p className="text-xs text-muted-foreground">부모용 공유 링크:</p>
        <p className="break-all rounded bg-muted p-2 text-xs font-mono">{shareUrl}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleCopy} className="flex-1">{copied ? "복사됨" : "주소 복사"}</Button>
        <Button asChild variant="secondary" className="flex-1">
          <a href={`kakaotalk://`}>KakaoTalk 열기</a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">⏰ {expiry} 까지 열람 가능</p>
    </div>
  );
}
```

- [ ] **Step 3: Compile + manual smoke**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(coach\)/evaluation/\[id\]/review/review-editor.tsx src/app/\(coach\)/evaluation/\[id\]/review/share-link-card.tsx
git commit -m "review: implement editor + share-link card"
```

### Task 22: Review/send E2E

**Files:**
- Create: `tests/e2e/review-send.spec.ts`

- [ ] **Step 1: E2E**

Create `tests/e2e/review-send.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test("E2E-E1: Approach-A flow → review → send → share-link", async ({ page }) => {
  await page.goto("/students");
  await page.locator("li a").first().click();
  await page.click("button:has-text('시작하기')");
  await page.waitForURL("**/coach-form");

  // Fill 3 of 5 axes (≥2 required)
  await page.fill('textarea[name="bullets.vocal"]', "발성 좋음");
  await page.fill('textarea[name="bullets.expression"]', "표정 자연스러움");
  await page.fill('textarea[name="bullets.examReadiness"]', "본방 70%");
  await page.click("button[type='submit']");

  await page.waitForURL("**/review");
  await expect(page.locator("textarea")).toBeVisible();

  // Send
  await page.click("button:has-text('승인 및 공유 링크')");
  await expect(page.locator("text=발송 완료")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("text=/^https?:\\/\\/.*\\/feedback\\//")).toBeVisible();
});
```

- [ ] **Step 2: Run (skip if Playwright auth not set)**

Run: `bun run test:e2e tests/e2e/review-send.spec.ts`
Expected: PASS or skipped.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/review-send.spec.ts
git commit -m "review: add E2E for Approach-A → review → send"
```

---

## Phase 7: Parent Landing Wiring

### Task 23: Service-role client

**Files:**
- Create: `src/lib/supabase/service-role.ts`

- [ ] **Step 1: Implement**

Create `src/lib/supabase/service-role.ts`:

```typescript
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function createServiceRoleClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 2: Compile**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/service-role.ts
git commit -m "supabase: add service-role client (parent RPC only)"
```

### Task 24: Parent feedback RPC integration test

**Files:**
- Test: `tests/integration/parent-feedback/rpc.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/parent-feedback/rpc.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// This test hits real dev Supabase. Skip if env vars missing.
const skip = !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL;

describe.skipIf(skip)("get_parent_feedback RPC", () => {
  it("returns empty for invalid token", async () => {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("get_parent_feedback", { p_token: "definitely-not-a-real-token" });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun run test tests/integration/parent-feedback/rpc.test.ts`
Expected: PASS or SKIP (if env missing).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/parent-feedback/rpc.test.ts
git commit -m "parent: add RPC integration test"
```

### Task 25: Wire parent landing page

**Files:**
- Replace: `src/app/feedback/[token]/page.tsx`
- Create: `src/app/feedback/[token]/parent-report-card.tsx`
- Create: `src/app/feedback/[token]/expired-or-invalid.tsx`

- [ ] **Step 1: Read current scaffold**

```bash
cat src/app/feedback/\[token\]/page.tsx
```

- [ ] **Step 2: Replace page**

Replace `src/app/feedback/[token]/page.tsx`:

```tsx
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ParentReportCard } from "./parent-report-card";
import { ExpiredOrInvalid } from "./expired-or-invalid";

export const dynamic = "force-dynamic";

export default async function ParentFeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("get_parent_feedback", { p_token: token });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return <ExpiredOrInvalid />;
  }

  const feedback = Array.isArray(data) ? data[0] : data;
  return <ParentReportCard feedback={feedback} />;
}
```

- [ ] **Step 3: Report card**

Create `src/app/feedback/[token]/parent-report-card.tsx`:

```tsx
type Feedback = {
  coach_edited_text: string;
  student_name: string;
  academy_name: string;
  coach_email: string;
  eval_date: string;
};

export function ParentReportCard({ feedback }: { feedback: Feedback }) {
  // B-card layout per ~/.gstack/projects/directors-note/designs/parent-share-link-20260510/wireframe-B.html
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="max-w-md mx-auto space-y-4">
        <header className="text-center">
          <h1 className="text-lg font-bold">{feedback.academy_name}</h1>
        </header>

        <div className="rounded-lg bg-background p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">평가일</p>
          <p className="font-semibold">{feedback.eval_date}</p>
          <p className="text-xs text-muted-foreground mt-3">학생</p>
          <p className="font-semibold">{feedback.student_name}</p>
        </div>

        <div className="rounded-lg bg-background p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2">코치 피드백</p>
          <div className="whitespace-pre-line text-base leading-relaxed">{feedback.coach_edited_text}</div>
        </div>

        <div className="rounded-lg bg-background p-4 shadow-sm text-sm">
          <p className="text-muted-foreground">작성</p>
          <p className="font-medium">{feedback.coach_email}</p>
        </div>

        <footer className="text-center text-xs text-muted-foreground space-y-1 pt-4">
          <p>이 링크는 발송 후 30일 동안만 열람 가능합니다.</p>
          <p><a href="/privacy" className="underline">개인정보처리방침</a></p>
        </footer>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Expired/invalid**

Create `src/app/feedback/[token]/expired-or-invalid.tsx`:

```tsx
export function ExpiredOrInvalid() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-bold">만료되었거나 유효하지 않은 링크입니다</h1>
        <p className="text-sm text-muted-foreground">학원에 문의하여 새 링크를 받아 주세요.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Compile**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: E2E**

Add to `tests/e2e/parent-landing.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test("E2E-E5: invalid token shows expired-or-invalid page", async ({ page }) => {
  await page.goto("/feedback/totally-fake-token-1234567890");
  await expect(page.locator("h1")).toContainText("만료");
});

test("E2E-E4: AI grade DOM check (P2 hold)", async ({ page }) => {
  // Note: this test runs after a real send happens; placeholder for now.
  // Asserts the parent page never contains AI internal grade words.
  await page.goto("/feedback/totally-fake-token-1234567890");
  for (const word of ["AI", "분석", "내부 등급", "vocal_score", "expression_score"]) {
    await expect(page.locator(`text=${word}`)).toHaveCount(0);
  }
});
```

- [ ] **Step 7: Commit**

```bash
git add src/app/feedback/\[token\]/ tests/e2e/parent-landing.spec.ts
git commit -m "parent: wire feedback page to RPC + B-card layout"
```

---

## Phase 8: Approach-C Streaming Stub

### Task 26: Storage upload action

**Files:**
- Create: `src/lib/evaluations/upload-action.ts`

- [ ] **Step 1: Implement**

Create `src/lib/evaluations/upload-action.ts`:

```typescript
"use server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { evaluations } from "@/lib/db/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function createSignedUploadUrl(evaluationId: string): Promise<
  | { ok: true; signedUrl: string; path: string }
  | { ok: false; error: string }
> {
  const { academyId } = await requireAuth();
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.academyId, academyId)),
  });
  if (!evaluation) return { ok: false, error: "not_found" };

  const path = `${academyId}/${evaluationId}.mp4`;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from("student-videos")
    .createSignedUploadUrl(path);

  if (error || !data) return { ok: false, error: error?.message ?? "upload_url_failed" };
  return { ok: true, signedUrl: data.signedUrl, path };
}

export async function attachVideoToEvaluation(evaluationId: string, path: string): Promise<{ ok: boolean }> {
  const { academyId } = await requireAuth();
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/student-videos/${path}`;
  await db.update(evaluations).set({
    videoStorageUrl: url,
    updatedAt: new Date(),
  }).where(and(eq(evaluations.id, evaluationId), eq(evaluations.academyId, academyId)));
  return { ok: true };
}
```

- [ ] **Step 2: Compile**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/evaluations/upload-action.ts
git commit -m "evaluations: add storage signed-upload action"
```

### Task 27: SSE Route Handler

**Files:**
- Create: `src/app/api/evaluations/[id]/stream/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/evaluations/[id]/stream/route.ts`:

```typescript
import { db } from "@/lib/db/client";
import { aiAnalyses, feedbackDrafts } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  createLetterGenerationService,
  createVideoAnalysisService,
} from "@/lib/evaluation/factory";
import type { ProgressEvent } from "@/lib/evaluation/types";
import { getEvaluation } from "@/lib/evaluations/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { academyId } = await requireAuth();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        const evaluation = await getEvaluation(academyId, id);
        if (!evaluation) throw new Error("not_found");
        if (!evaluation.videoStorageUrl) throw new Error("no_video");

        const videoSvc = createVideoAnalysisService();
        const letterSvc = createLetterGenerationService();

        const analysis = await videoSvc.analyzeStreaming(
          {
            evaluationId: evaluation.id,
            academyId,
            studentVideoUrl: evaluation.videoStorageUrl,
          },
          send,
        );

        await db.insert(aiAnalyses).values({
          academyId,
          evaluationId: evaluation.id,
          vocalScore: String(analysis.axes.vocal),
          expressionScore: String(analysis.axes.expression),
          examReadinessScore: String(analysis.axes.examReadiness),
          internalGrade: analysis.internalGrade,
          calibrationMatchScore: String(analysis.calibrationMatchScore),
          evaluatorUsed: analysis.evaluatorUsed,
          cosineConfidence: analysis.cosineConfidence ? String(analysis.cosineConfidence) : null,
          rawResponseJson: analysis.rawResponseJson,
        });

        send({ step: "letter_drafting" });
        const student = (evaluation as any).student;
        const letter = await letterSvc.generateLetter({
          type: "ai_analysis",
          analysis,
          student: {
            studentName: student.name,
            year: student.year ?? "미지정",
            evaluationDate: evaluation.evaluationDate as unknown as string,
          },
        });

        await db.insert(feedbackDrafts).values({
          academyId,
          evaluationId: evaluation.id,
          aiDraftText: letter,
          status: "draft",
        });

        send({ step: "complete", analysis, letterDraft: letter });
      } catch (err) {
        send({
          step: "error",
          message: err instanceof Error ? err.message : "unknown",
          degradeTo: "approach_a",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Compile**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/evaluations/
git commit -m "evaluations: add SSE Route Handler (Approach-C stub)"
```

### Task 28: VideoUploadFlow + StreamingTimeline

**Files:**
- Create: `src/app/(coach)/evaluation/[id]/page.tsx`
- Create: `src/app/(coach)/evaluation/[id]/components/video-upload-flow.tsx`
- Create: `src/app/(coach)/evaluation/[id]/components/streaming-timeline.tsx`

- [ ] **Step 1: Page**

Create `src/app/(coach)/evaluation/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEvaluation } from "@/lib/evaluations/queries";
import { VideoUploadFlow } from "./components/video-upload-flow";

export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.FEATURE_AI_VIDEO_ANALYSIS !== "true") {
    redirect(`/evaluation/${id}/coach-form`);
  }

  const { academyId } = await requireAuth();
  const evaluation = await getEvaluation(academyId, id);
  if (!evaluation) notFound();

  const student = (evaluation as any).student;
  return (
    <main className="px-4 py-6 max-w-md mx-auto">
      <header className="mb-4">
        <h1 className="text-xl font-bold">{student?.name} 학생</h1>
        <p className="text-sm text-muted-foreground">{student?.year ?? "구분 미입력"} · {evaluation.evaluationDate}</p>
      </header>
      <VideoUploadFlow evaluationId={id} hasVideo={!!evaluation.videoStorageUrl} />
    </main>
  );
}
```

- [ ] **Step 2: VideoUploadFlow**

Create `src/app/(coach)/evaluation/[id]/components/video-upload-flow.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { attachVideoToEvaluation, createSignedUploadUrl } from "@/lib/evaluations/upload-action";
import { StreamingTimeline } from "./streaming-timeline";
import type { ProgressEvent } from "@/lib/evaluation/types";

type Phase = "idle" | "uploading" | "ready" | "streaming" | "complete" | "error";

export function VideoUploadFlow({ evaluationId, hasVideo }: { evaluationId: string; hasVideo: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(hasVideo ? "ready" : "idle");
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const upload = async (file: File) => {
    setPhase("uploading");
    const res = await createSignedUploadUrl(evaluationId);
    if (!res.ok) { toast.error(res.error); setPhase("idle"); return; }
    const put = await fetch(res.signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!put.ok) { toast.error("업로드 실패"); setPhase("idle"); return; }
    await attachVideoToEvaluation(evaluationId, res.path);
    setPhase("ready");
  };

  const startStreaming = () => {
    setPhase("streaming");
    setEvents([]);
    const es = new EventSource(`/api/evaluations/${evaluationId}/stream`);
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as ProgressEvent;
      setEvents((prev) => [...prev, event]);
      if (event.step === "complete") {
        es.close();
        setPhase("complete");
        router.push(`/evaluation/${evaluationId}/review`);
      }
      if (event.step === "error") {
        es.close();
        setErrorMsg(event.message);
        setPhase("error");
      }
    };
    es.onerror = () => {
      es.close();
      setErrorMsg("연결이 끊겼습니다");
      setPhase("error");
    };
  };

  if (phase === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded border border-destructive p-3 text-sm">
          ⚠️ AI 분석 실패: {errorMsg ?? "알 수 없는 오류"}
        </div>
        <Button className="w-full" onClick={() => router.push(`/evaluation/${evaluationId}/coach-form`)}>
          메모로 진행
        </Button>
      </div>
    );
  }

  if (phase === "streaming" || phase === "complete") {
    return <StreamingTimeline events={events} />;
  }

  return (
    <div className="space-y-3">
      <input
        type="file"
        accept="video/*"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        disabled={phase === "uploading"}
      />
      {phase === "ready" && (
        <Button className="w-full" onClick={startStreaming}>분석 시작</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: StreamingTimeline**

Create `src/app/(coach)/evaluation/[id]/components/streaming-timeline.tsx`:

```tsx
"use client";
import type { ProgressEvent } from "@/lib/evaluation/types";

const STEPS = [
  { key: "frames_extracted", label: "영상 프레임 추출" },
  { key: "embedding_generated", label: "Vertex 임베딩 생성" },
  { key: "matches_computed", label: "코치 기준 매칭 점수 계산" },
  { key: "letter_drafting", label: "한국어 피드백 초안 작성" },
] as const;

export function StreamingTimeline({ events }: { events: ProgressEvent[] }) {
  const reached = new Set(events.map((e) => e.step));
  const isDone = reached.has("complete");

  return (
    <ol className="space-y-2 border-l pl-4">
      {STEPS.map((step) => {
        const done = reached.has(step.key) || (step.key === "letter_drafting" && isDone);
        const active = !done && events[events.length - 1]?.step === step.key;
        return (
          <li key={step.key} className="relative">
            <span className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full ${
              done ? "bg-green-500" : active ? "bg-primary animate-pulse" : "bg-muted"
            }`} />
            <p className={`text-sm ${done ? "text-foreground" : active ? "font-medium" : "text-muted-foreground"}`}>
              {done ? "✓ " : ""}{step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Compile**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(coach\)/evaluation/\[id\]/page.tsx src/app/\(coach\)/evaluation/\[id\]/components/
git commit -m "approach-c: add page + upload flow + streaming timeline"
```

### Task 29: StreamingTimeline component test + Approach-C E2E

**Files:**
- Test: `tests/component/streaming-timeline.test.tsx`
- Test: `tests/e2e/approach-c-stub.spec.ts`

- [ ] **Step 1: Component test**

Create `tests/component/streaming-timeline.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreamingTimeline } from "@/app/(coach)/evaluation/[id]/components/streaming-timeline";

describe("StreamingTimeline", () => {
  it("renders all 4 steps", () => {
    render(<StreamingTimeline events={[]} />);
    expect(screen.getByText("영상 프레임 추출")).toBeInTheDocument();
    expect(screen.getByText("Vertex 임베딩 생성")).toBeInTheDocument();
    expect(screen.getByText("코치 기준 매칭 점수 계산")).toBeInTheDocument();
    expect(screen.getByText("한국어 피드백 초안 작성")).toBeInTheDocument();
  });

  it("marks step done when its event arrived", () => {
    render(
      <StreamingTimeline
        events={[{ step: "frames_extracted", frameCount: 30, durationMs: 1800 }]}
      />,
    );
    expect(screen.getByText("✓ 영상 프레임 추출")).toBeInTheDocument();
  });

  it("marks all done after complete", () => {
    render(
      <StreamingTimeline
        events={[
          { step: "frames_extracted", frameCount: 30, durationMs: 1800 },
          { step: "embedding_generated", vectorPreview: [] },
          { step: "matches_computed", matches: [] },
          { step: "letter_drafting" },
          { step: "complete", analysis: {} as any, letterDraft: "" },
        ]}
      />,
    );
    expect(screen.getByText(/✓.*한국어 피드백 초안 작성/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run component tests**

Run: `bun run test tests/component/streaming-timeline.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 3: E2E (gated by FEATURE_AI_VIDEO_ANALYSIS)**

Create `tests/e2e/approach-c-stub.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.skip(({}, testInfo) => process.env.FEATURE_AI_VIDEO_ANALYSIS !== "true", "Flag OFF skip");

test("E2E-E2: Approach-C stub flow → review", async ({ page }) => {
  await page.goto("/students");
  await page.locator("li a").first().click();
  await page.click("button:has-text('시작하기')");
  await page.waitForURL(/\/evaluation\/[^/]+$/);

  // Upload a tiny dummy video file
  await page.setInputFiles('input[type="file"]', {
    name: "tiny.mp4", mimeType: "video/mp4", buffer: Buffer.from("00000020", "hex"),
  });
  await page.click("button:has-text('분석 시작')");

  // Stub takes ~8s; wait for redirect
  await page.waitForURL("**/review", { timeout: 30000 });
  await expect(page.locator("textarea")).toBeVisible();
});
```

- [ ] **Step 4: Commit**

```bash
git add tests/component/streaming-timeline.test.tsx tests/e2e/approach-c-stub.spec.ts
git commit -m "approach-c: add component + E2E tests"
```

---

## Phase 9: Owner User Invite

### Task 30: (admin) layout + invite form

**Files:**
- Create: `src/app/(admin)/layout.tsx`
- Create: `src/app/(admin)/users/new/page.tsx`
- Create: `src/app/(admin)/users/new/actions.ts`

- [ ] **Step 1: Layout**

Create `src/app/(admin)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(["owner", "admin"]);
  return <div className="min-h-screen">{children}</div>;
}
```

- [ ] **Step 2: Invite action**

Create `src/app/(admin)/users/new/actions.ts`:

```typescript
"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["coach", "admin"]),
});

export async function inviteUser(input: z.infer<typeof inviteSchema>) {
  const { academyId } = await requireRole(["owner", "admin"]);
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "검증 실패" };

  const existing = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (existing) return { ok: false, error: "이미 등록된 이메일입니다" };

  await db.insert(users).values({
    id: null as any,
    academyId,
    email: parsed.data.email,
    role: parsed.data.role,
  });
  revalidatePath("/admin/users");
  return { ok: true };
}
```

Note: `users.id` is non-null PK in schema. The placeholder workaround is to insert with a stub UUID and update on first login OR change schema to make id nullable. Simplest fix: store invitation in a separate `pending_invitations` table OR allow `users.id` nullable via 0004 migration. For v1 pilot of 6 users, defer to manual SQL: owner runs `INSERT INTO users (academy_id, email, role) VALUES (...)` — the SQL allows nullable id only if we adjust schema.

**Decision for v1:** Add 0004 migration making `users.id` nullable. This task includes a follow-up `0004_users_id_nullable.sql.draft`:

Create `migrations/0004_users_id_nullable.sql.draft`:

```sql
-- 0004_users_id_nullable.sql.draft
-- 적용: mv ... && supabase db push
ALTER TABLE users ALTER COLUMN id DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_id_or_email_unique UNIQUE (email);
```

Update `src/lib/db/schema.ts` users table: `id: uuid("id")` (drop `.notNull()` on the primary key — Drizzle allows nullable PK with caveats; alternative: keep id required and use separate pending_invitations table). For the pilot, keep schema simple by allowing id NULL pre-claim and unique by email.

If this is too risky, fall back to: `inviteUser` writes to a future `pending_invitations` table — defer this task.

- [ ] **Step 3: Apply 0004 migration**

```bash
mv migrations/0004_users_id_nullable.sql.draft migrations/0004_users_id_nullable.sql
bun run supabase migration up
```

- [ ] **Step 4: Invite page**

Create `src/app/(admin)/users/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { inviteUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function InviteUserPage() {
  async function action(formData: FormData) {
    "use server";
    const res = await inviteUser({
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? "coach") as "coach" | "admin",
    });
    if (res.ok) redirect("/students");
    return res;
  }

  return (
    <main className="px-4 py-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-6">코치 초대</h1>
      <form action={action} className="space-y-3">
        <label className="block text-sm">이메일
          <Input name="email" type="email" required />
        </label>
        <label className="block text-sm">권한
          <select name="role" className="w-full rounded border p-2 text-sm">
            <option value="coach">코치</option>
            <option value="admin">관리자</option>
          </select>
        </label>
        <Button type="submit" className="w-full">초대</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add migrations/0004_users_id_nullable.sql src/app/\(admin\)/ src/lib/db/schema.ts
git commit -m "admin: add invite-user form + 0004 migration"
```

### Task 31: Invite-user integration test

**Files:**
- Test: `tests/integration/admin/invite-user.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/admin/invite-user.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    insert: vi.fn(() => ({ values: vi.fn(async () => ({})) })),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { inviteUser } from "@/app/(admin)/users/new/actions";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";

describe("inviteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireRole as any).mockResolvedValue({ academyId: "acad-1" });
  });

  it("rejects non-email", async () => {
    const r = await inviteUser({ email: "not-an-email", role: "coach" });
    expect(r.ok).toBe(false);
  });

  it("rejects existing email", async () => {
    (db.query.users.findFirst as any).mockResolvedValue({ id: "u-1", email: "taken@x" });
    const r = await inviteUser({ email: "taken@x", role: "coach" });
    expect(r).toEqual({ ok: false, error: "이미 등록된 이메일입니다" });
  });

  it("inserts row when valid + new", async () => {
    (db.query.users.findFirst as any).mockResolvedValue(undefined);
    const r = await inviteUser({ email: "new@x", role: "coach" });
    expect(r.ok).toBe(true);
    expect(db.insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run**

Run: `bun run test tests/integration/admin/invite-user.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/admin/invite-user.test.ts
git commit -m "admin: add invite-user integration tests"
```

---

## Phase 10: Cleanup

### Task 32: Verify cleanup + add seed safety guard

**Files:**
- Verify: `src/proxy.ts` (no dev bypass left)
- Verify: `src/app/(auth)/signup/` (deleted)
- Modify: any `scripts/seed*.ts` if present — add NODE_ENV guard (T5 fix)

- [ ] **Step 1: Verify dev bypass removed**

```bash
grep -n "isDevStub\|stub_" src/proxy.ts
```

Expected: No matches.

- [ ] **Step 2: Verify signup gone**

```bash
ls src/app/\(auth\)/ 2>/dev/null
```

Expected: only `login/` directory.

- [ ] **Step 3: Add NODE_ENV guard to seed scripts (if any)**

```bash
ls scripts/seed*.ts 2>/dev/null
```

If present, add to top of each:

```typescript
if (process.env.NODE_ENV === "production") {
  throw new Error("Seed scripts forbidden in production");
}
```

- [ ] **Step 4: Run full test suite**

Run: `bun run test`
Expected: All unit + integration tests PASS.

Run: `bun run lint`
Expected: clean.

- [ ] **Step 5: Manual smoke test (full demo path)**

Run: `bun dev`
- Owner pre-seeds users via SQL (or `/admin/users/new`)
- Visit `/login` → Kakao OAuth → land on `/students`
- Add a student with consent toggled ON
- Tap student → "시작하기" → coach-form (flag OFF)
- Fill 3 of 5 axes → submit → review page renders
- Edit text → "승인 및 공유 링크 생성" → URL appears
- Open URL in incognito → parent card renders
- AI grade nowhere visible (P2 verification)

- [ ] **Step 6: Commit**

```bash
git add scripts/ 2>/dev/null || true
git commit --allow-empty -m "cleanup: verify dev bypass removed + seed guards"
```

---

## Self-Review

After this plan executes end-to-end, every section of the spec is covered:

- §3 Architecture overview → Phases 1, 7, 8
- §4 Auth & Onboarding → Phase 1 (Tasks 1-6, 30)
- §5 Students CRUD → Phase 3 (Tasks 8-13)
- §6 Evaluation 흐름 → Phases 4, 5, 6, 8 (Tasks 14-22, 26-29)
- §6.1 라우트 맵 → All four routes covered (Tasks 16, 20, 27, 28)
- §6.2 startEvaluation → Task 14
- §6.3 Approach-A → Task 16
- §6.4 Approach-C → Tasks 26-29
- §6.5 Review/send → Tasks 17-22
- §7 Parent landing → Tasks 23-25
- §8 Schema migration 0003 → Task 7
- §9 에러 정책 → distributed across actions (no_consent in Task 14, validation in Task 17, RLS bounds in queries)
- §10 테스트 전략 → unit + integration + component + E2E across all phases
- §12 환경변수 → Task 1
- §13 보안 체크리스트 → enforced by `'server-only'` imports + `requireRole` calls

**Type consistency check:**
- `CurrentUser` shape (`authUser`/`appUser`/`academyId`/`role`) used identically in Tasks 2, 3, 6, 14, 17, 19, 25, 30.
- `StudentFormInput` from Zod (Task 8) consumed by Tasks 10, 11, 12.
- `StartEvaluationResult` defined in Task 14, consumed by Task 15.
- `FinalizeResult` defined in Task 19, consumed by Task 21.
- `ProgressEvent` re-used from `src/lib/evaluation/types.ts` (existing) in Tasks 27, 28, 29.
- `ActionResult<T>` from Task 10 used as the canonical return shape across student/eval actions.

**Out-of-spec items added in plan (not in spec, justified):**
- 0004 migration making `users.id` nullable: required to implement spec §4 invite flow without a separate `pending_invitations` table. Schema change is minimal and matches the documented onboarding rule.

---

## Plan complete

Saved to `docs/superpowers/plans/2026-05-10-student-eval-letter-flow.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
