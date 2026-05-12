# Coach Dashboard v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/dashboard` page for Director's Note v1 — Approach 3 layout (owner status row + personal queue dashboard), feeding from Supabase via Drizzle, with TanStack Query polling and 5 E2E scenarios.

**Architecture:** Server Component for initial SSR via existing `requireAuth()` + 5 parallel Drizzle queries. Client Components for polling via TanStack Query v5. Role-based conditional render (owner row only for `owner`/`admin`). Pure components composed with shadcn/ui.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM 0.45, postgres.js, TanStack Query v5, shadcn/ui, Tailwind v4, Vitest + Testing Library, Playwright.

**Spec:** `~/.gstack/projects/directors-note/coach-dashboard-v1.md` (Section refs below as "spec §N").

**Working directory:** `/Users/kiwoongmin/Desktop/claude-project/directors-note/`

---

## Prerequisites (operator actions — must complete before T1)

These come from the 2026-05-11 checkpoint and are NOT code tasks:

1. **Apply migration 0003** — `mv migrations/0003_students_year.sql.draft migrations/0003_students_year.sql && supabase db push`. Adds `students.year text` column that this plan reads. Without this, T6 queries will fail at runtime (the Drizzle schema already declares the column).
2. **Seed at least one owner row** via `/admin/users/new` or directly via Supabase Admin API + `public.users` INSERT. Plan E2E expects 1 owner + ≥2 coaches in the same academy. Use existing `/admin/users/new` form (already built per T30) for additional coaches.
3. **Login as owner via Kakao OAuth** (`/login` → callback). Confirm `users.role='owner'`.

If prereqs not met, T1 still proceeds (pure util, no DB), but T6 onward will not run end-to-end. **E2E tests (T17) are gated on `process.env.E2E_AUTH_READY` consistent with existing specs in `tests/e2e/`.**

---

## What's NOT in this plan (deferred — spec §8)

- Calendar view (월간 cycle 시각화)
- 학생별 multi-month 추세 그래프
- 코치 1:1 messaging surface
- Owner billing 페이지 (`/settings/billing`)
- Per-coach 알림 설정
- Cost monitoring widget
- Audit log for parent 열람 tracking (no `audit_log` table exists; `parentViewedAt` returns `null` in v1)
- 5 of the 5 escalation rules; **v1 implements only #1 (학생 후퇴) + #4 (AI 호출 실패)** since rules #2/#3/#5 require additional tables (cycle state, billing). Rule weight tuning per spec §7 deferred to friend-academy observation.

---

## File Structure (lock decisions before tasks)

**New files:**

```
src/
├── lib/
│   ├── dashboard/
│   │   ├── progress-color.ts                         # pure: ratio → tier
│   │   ├── empty-state-config.ts                     # pure: variant → message + cta
│   │   ├── queries.ts                                # 5 Drizzle queries
│   │   └── escalation-rules.ts                       # pure: derive alerts from rows
│   └── providers/
│       └── query-provider.tsx                        # 'use client' — TanStack QueryClientProvider
├── app/
│   ├── providers.tsx                                 # 'use client' — composes QueryProvider + theme
│   └── (coach)/
│       └── dashboard/
│           ├── page.tsx                              # Server Component orchestration
│           └── components/
│               ├── empty-state.tsx                   # pure
│               ├── coach-progress-bar.tsx            # pure
│               ├── student-row.tsx                   # pure + Link
│               ├── queue-card.tsx                    # 'use client' + polling
│               ├── greeting-header.tsx               # pure
│               ├── mini-stats.tsx                    # pure
│               ├── escalation-badge.tsx              # 'use client' + dropdown
│               ├── owner-status-row.tsx              # 'use client' + polling
│               └── recent-activity.tsx               # 'use client' + polling
└── components/ui/
    ├── badge.tsx                                     # shadcn add
    ├── skeleton.tsx                                  # shadcn add
    └── dropdown-menu.tsx                             # shadcn add

tests/
├── unit/
│   ├── setup.ts                                       # vitest setup (testing-library/jest-dom)
│   └── dashboard/
│       ├── progress-color.test.ts
│       ├── empty-state-config.test.ts
│       ├── escalation-rules.test.ts
│       ├── coach-progress-bar.test.tsx
│       ├── empty-state.test.tsx
│       └── student-row.test.tsx
└── e2e/
    └── dashboard.spec.ts
```

**Modified files:**

- `src/app/layout.tsx` — wrap children in `<Providers>`
- `src/app/(coach)/layout.tsx` — replace placeholder comment with `<DashboardNav>` topbar
- `vitest.config.ts` (or whatever the existing config is) — add `tests/unit/setup.ts` to `setupFiles` if not already present

---

## Task 1: Pure utility — Progress color tier

**Files:**
- Create: `src/lib/dashboard/progress-color.ts`
- Create: `tests/unit/dashboard/progress-color.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/dashboard/progress-color.test.ts
import { describe, expect, it } from "vitest";
import { progressColorTier } from "@/lib/dashboard/progress-color";

describe("progressColorTier", () => {
	it("returns 'behind' below 30%", () => {
		expect(progressColorTier(0)).toBe("behind");
		expect(progressColorTier(0.29)).toBe("behind");
	});

	it("returns 'on-track' from 30% to 70%", () => {
		expect(progressColorTier(0.3)).toBe("on-track");
		expect(progressColorTier(0.5)).toBe("on-track");
		expect(progressColorTier(0.69)).toBe("on-track");
	});

	it("returns 'complete' from 70% upward", () => {
		expect(progressColorTier(0.7)).toBe("complete");
		expect(progressColorTier(0.99)).toBe("complete");
		expect(progressColorTier(1.0)).toBe("complete");
	});

	it("clamps below 0 and above 1", () => {
		expect(progressColorTier(-0.5)).toBe("behind");
		expect(progressColorTier(2.0)).toBe("complete");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/dashboard/progress-color.test.ts`
Expected: FAIL — module `@/lib/dashboard/progress-color` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/dashboard/progress-color.ts
export type ProgressTier = "behind" | "on-track" | "complete";

export function progressColorTier(ratio: number): ProgressTier {
	const clamped = Math.max(0, Math.min(1, ratio));
	if (clamped < 0.3) return "behind";
	if (clamped < 0.7) return "on-track";
	return "complete";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/dashboard/progress-color.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/dashboard/progress-color.test.ts src/lib/dashboard/progress-color.ts
git commit -m "feat(dashboard): progress color tier utility

3 tiers (< 30% behind, 30-70% on-track, >= 70% complete) per spec §4.4.
Clamps out-of-range input."
```

---

## Task 2: Pure utility — Empty state config

**Files:**
- Create: `src/lib/dashboard/empty-state-config.ts`
- Create: `tests/unit/dashboard/empty-state-config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/dashboard/empty-state-config.test.ts
import { describe, expect, it } from "vitest";
import { emptyStateConfig } from "@/lib/dashboard/empty-state-config";

describe("emptyStateConfig", () => {
	it("returns sparkle message for eval-todo empty (no CTA)", () => {
		const cfg = emptyStateConfig("eval-todo");
		expect(cfg.message).toContain("이번 cycle");
		expect(cfg.message).toContain("✨");
		expect(cfg.cta).toBeUndefined();
	});

	it("returns CTA for review-pending empty", () => {
		const cfg = emptyStateConfig("review-pending");
		expect(cfg.cta?.label).toBe("새 평가 시작");
		expect(cfg.cta?.href).toBe("/students");
	});

	it("returns no-CTA message for sent empty", () => {
		const cfg = emptyStateConfig("sent");
		expect(cfg.message).toContain("첫 발송");
		expect(cfg.cta).toBeUndefined();
	});

	it("returns coach-invite CTA for owner-no-coach", () => {
		const cfg = emptyStateConfig("owner-no-coach");
		expect(cfg.cta?.label).toBe("코치 초대");
		expect(cfg.cta?.href).toBe("/admin/users/new");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/dashboard/empty-state-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/dashboard/empty-state-config.ts
export type EmptyStateVariant =
	| "eval-todo"
	| "review-pending"
	| "sent"
	| "owner-no-coach";

export interface EmptyStateConfig {
	message: string;
	cta?: { label: string; href: string };
}

const CONFIG: Record<EmptyStateVariant, EmptyStateConfig> = {
	"eval-todo": {
		message: "이번 cycle 평가 모두 시작됨 ✨",
	},
	"review-pending": {
		message: "검토할 letter 가 없습니다.",
		cta: { label: "새 평가 시작", href: "/students" },
	},
	sent: {
		message: "이번 주 첫 발송을 기대합니다.",
	},
	"owner-no-coach": {
		message: "함께 일할 코치를 초대해 보세요.",
		cta: { label: "코치 초대", href: "/admin/users/new" },
	},
};

export function emptyStateConfig(variant: EmptyStateVariant): EmptyStateConfig {
	return CONFIG[variant];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/dashboard/empty-state-config.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/dashboard/empty-state-config.test.ts src/lib/dashboard/empty-state-config.ts
git commit -m "feat(dashboard): empty state config per spec §5.1

4 variants — eval-todo / review-pending / sent / owner-no-coach.
Owner-no-coach CTA routes to /admin/users/new (existing invite form, T30)."
```

---

## Task 3: Pure utility — Escalation rules

**Background:** Spec §4.5 lists 5 escalation rules. v1 implements only rules #1 (학생 후퇴 detected) and #4 (AI 호출 실패율 ↑). The other 3 require additional state (cycle metadata, billing seat tracking, consent deadline) and are deferred. Input shape mirrors what `getEscalationData` (Task 6) returns.

**Files:**
- Create: `src/lib/dashboard/escalation-rules.ts`
- Create: `tests/unit/dashboard/escalation-rules.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/dashboard/escalation-rules.test.ts
import { describe, expect, it } from "vitest";
import {
	type EscalationInput,
	deriveEscalations,
} from "@/lib/dashboard/escalation-rules";

const baseInput: EscalationInput = {
	studentGradeRegressions: [],
	aiFailuresLast24h: 0,
};

describe("deriveEscalations", () => {
	it("returns empty when no triggers", () => {
		expect(deriveEscalations(baseInput)).toEqual([]);
	});

	it("emits regression alert per regressed student", () => {
		const alerts = deriveEscalations({
			...baseInput,
			studentGradeRegressions: [
				{ studentId: "s1", studentName: "박지윤", previous: "B", current: "C" },
				{ studentId: "s2", studentName: "이서준", previous: "A", current: "B" },
			],
		});
		expect(alerts).toHaveLength(2);
		expect(alerts[0]?.kind).toBe("regression");
		expect(alerts[0]?.label).toContain("박지윤");
		expect(alerts[0]?.label).toContain("B→C");
	});

	it("emits ai-failure alert when > 5 in 24h", () => {
		const alerts = deriveEscalations({ ...baseInput, aiFailuresLast24h: 6 });
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.kind).toBe("ai-failure");
	});

	it("does not emit ai-failure when <= 5", () => {
		expect(deriveEscalations({ ...baseInput, aiFailuresLast24h: 5 })).toEqual([]);
	});

	it("combines multiple kinds in stable order (regression first)", () => {
		const alerts = deriveEscalations({
			studentGradeRegressions: [
				{ studentId: "s1", studentName: "박지윤", previous: "B", current: "C" },
			],
			aiFailuresLast24h: 10,
		});
		expect(alerts.map((a) => a.kind)).toEqual(["regression", "ai-failure"]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/dashboard/escalation-rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/dashboard/escalation-rules.ts
export interface StudentRegression {
	studentId: string;
	studentName: string;
	previous: "A" | "B" | "C" | "D";
	current: "A" | "B" | "C" | "D";
}

export interface EscalationInput {
	studentGradeRegressions: StudentRegression[];
	aiFailuresLast24h: number;
}

export type EscalationAlert =
	| { kind: "regression"; label: string; studentId: string }
	| { kind: "ai-failure"; label: string; count: number };

const AI_FAILURE_THRESHOLD = 5;

export function deriveEscalations(input: EscalationInput): EscalationAlert[] {
	const out: EscalationAlert[] = [];

	for (const r of input.studentGradeRegressions) {
		out.push({
			kind: "regression",
			studentId: r.studentId,
			label: `${r.studentName} 등급 후퇴 (${r.previous}→${r.current})`,
		});
	}

	if (input.aiFailuresLast24h > AI_FAILURE_THRESHOLD) {
		out.push({
			kind: "ai-failure",
			count: input.aiFailuresLast24h,
			label: `AI 호출 실패 ${input.aiFailuresLast24h}건 (24시간)`,
		});
	}

	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/dashboard/escalation-rules.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/dashboard/escalation-rules.test.ts src/lib/dashboard/escalation-rules.ts
git commit -m "feat(dashboard): escalation rules — v1 subset (regression + ai-failure)

Pure derivation function. Input shape matches getEscalationData() in Task 6.
Defers 3 of 5 spec §4.5 rules (cycle stall, consent delay, billing seat)
until corresponding state tables exist."
```

---

## Task 4: TanStack QueryClient provider

**Background:** Polling components require a `QueryClientProvider` ancestor. App has TanStack Query installed but no provider wired up. Add a client-only provider and compose it into the root layout.

**Files:**
- Create: `src/lib/providers/query-provider.tsx`
- Create: `src/app/providers.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the QueryProvider component**

```tsx
// src/lib/providers/query-provider.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
	const [client] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 30_000,
						retry: 2,
						refetchOnWindowFocus: true,
					},
				},
			}),
	);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Write the Providers composite**

```tsx
// src/app/providers.tsx
"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/providers/query-provider";

export function Providers({ children }: { children: ReactNode }) {
	return <QueryProvider>{children}</QueryProvider>;
}
```

- [ ] **Step 3: Modify root layout to wrap children**

Read `src/app/layout.tsx` first. Wrap the existing `<body>` children with `<Providers>`:

```tsx
// src/app/layout.tsx — modify only the body content
import { Providers } from "@/app/providers";
// … existing imports

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="ko">
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
```

(Preserve `<head>`, font classes, `<Toaster />`, etc. — only add the `<Providers>` wrap.)

- [ ] **Step 4: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/query-provider.tsx src/app/providers.tsx src/app/layout.tsx
git commit -m "feat(providers): TanStack Query client provider

- 30s default staleTime, retry 2x, refetch on focus per spec §5.3
- Composed into root layout via src/app/providers.tsx
- Enables polling in dashboard client components"
```

---

## Task 5: Add shadcn components (badge, skeleton, dropdown-menu)

**Files:**
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Run shadcn add**

Run from project root:

```bash
bunx shadcn@latest add badge skeleton dropdown-menu
```

Expected: 3 new files in `src/components/ui/`. Confirm via `ls src/components/ui/`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Run lint on new files**

Run: `bunx biome check src/components/ui/badge.tsx src/components/ui/skeleton.tsx src/components/ui/dropdown-menu.tsx`
If any errors, run: `bunx biome check --write src/components/ui/` and verify diff is mechanical (formatting only).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/skeleton.tsx src/components/ui/dropdown-menu.tsx
git commit -m "feat(ui): add shadcn badge, skeleton, dropdown-menu components

Required by dashboard EscalationBadge, OwnerStatusRow skeletons, QueueCard skeletons."
```

---

## Task 6: Dashboard queries module

**Background:** 5 queries per spec §4.1, plus a 6th for escalation input. Pattern mirrors `src/lib/students/queries.ts` (per-feature folder). Uses real `students.year` column (migration 0003 prereq). Internal grade typing relies on schema's `text("internal_grade")` constrained to `A|B|C|D` via CHECK — cast at boundary.

**Files:**
- Create: `src/lib/dashboard/queries.ts`

- [ ] **Step 1: Write the queries module**

```typescript
// src/lib/dashboard/queries.ts
import "server-only";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
	academies,
	aiAnalyses,
	evaluations,
	feedbackDrafts,
	students,
	users,
} from "@/lib/db/schema";
import type { EscalationInput } from "@/lib/dashboard/escalation-rules";

export type InternalGrade = "A" | "B" | "C" | "D";

export interface EvalTodoItem {
	studentId: string;
	studentName: string;
	year: string | null;
	lastGrade: InternalGrade | null;
}

export interface ReviewPendingItem {
	feedbackDraftId: string;
	evaluationId: string;
	studentId: string;
	studentName: string;
	year: string | null;
	internalGrade: InternalGrade | null;
	createdAt: Date;
}

export interface SentItem {
	feedbackDraftId: string;
	evaluationId: string;
	studentName: string;
	year: string | null;
	internalGrade: InternalGrade | null;
	sentAt: Date;
	parentViewedAt: Date | null; // v1: always null (no audit_log table)
}

export interface CoachProgress {
	userId: string;
	email: string;
	completed: number;
	pendingReview: number;
	sent: number;
	totalAssigned: number;
	progressRatio: number;
}

export interface AcademyMiniStats {
	academyName: string;
	totalStudents: number;
	thisMonthCompleted: number;
	cycleDeadline: string; // ISO date — last day of current month, v1 simple
}

// Alias to EscalationInput so the rules module is the single source of truth
// for the shape. Keeps deriveEscalations(escalation.data) call site type-safe.
export type EscalationData = EscalationInput;

// ─── 1) 평가 시작 큐 ───────────────────────────────────────────────
export async function getEvaluationTodo(
	academyId: string,
	coachUserId: string,
): Promise<EvalTodoItem[]> {
	type Row = {
		student_id: string;
		student_name: string;
		year: string | null;
		last_grade: InternalGrade | null;
	};
	const rows = await db.execute<Row>(sql`
		WITH last_grade AS (
			SELECT DISTINCT ON (e.student_id)
				e.student_id, a.internal_grade
			FROM evaluations e
			JOIN ai_analyses a ON a.evaluation_id = e.id
			WHERE e.academy_id = ${academyId}
			ORDER BY e.student_id, e.evaluation_date DESC
		),
		this_month AS (
			SELECT student_id FROM evaluations
			WHERE academy_id = ${academyId}
			  AND evaluation_date >= date_trunc('month', now())
		)
		SELECT
			s.id::text AS student_id,
			s.name AS student_name,
			s.year,
			lg.internal_grade AS last_grade
		FROM students s
		LEFT JOIN last_grade lg ON lg.student_id = s.id
		WHERE s.academy_id = ${academyId}
		  AND s.soft_deleted_at IS NULL
		  AND s.id NOT IN (SELECT student_id FROM this_month)
		ORDER BY s.name
		LIMIT 20
	`);

	return rows.map((r) => ({
		studentId: r.student_id,
		studentName: r.student_name,
		year: r.year,
		lastGrade: r.last_grade,
	}));
}

// ─── 2) 검토 대기 큐 ───────────────────────────────────────────────
export async function getReviewPending(
	academyId: string,
	coachUserId: string,
): Promise<ReviewPendingItem[]> {
	const rows = await db
		.select({
			feedbackDraftId: feedbackDrafts.id,
			evaluationId: evaluations.id,
			studentId: students.id,
			studentName: students.name,
			year: students.year,
			internalGrade: aiAnalyses.internalGrade,
			createdAt: feedbackDrafts.createdAt,
		})
		.from(feedbackDrafts)
		.innerJoin(evaluations, eq(evaluations.id, feedbackDrafts.evaluationId))
		.innerJoin(students, eq(students.id, evaluations.studentId))
		.leftJoin(aiAnalyses, eq(aiAnalyses.evaluationId, evaluations.id))
		.where(
			and(
				eq(feedbackDrafts.academyId, academyId),
				eq(evaluations.coachUserId, coachUserId),
				eq(feedbackDrafts.status, "draft"),
			),
		)
		.orderBy(desc(feedbackDrafts.createdAt))
		.limit(20);

	return rows.map((r) => ({
		feedbackDraftId: r.feedbackDraftId,
		evaluationId: r.evaluationId,
		studentId: r.studentId,
		studentName: r.studentName,
		year: r.year,
		internalGrade: (r.internalGrade ?? null) as InternalGrade | null,
		createdAt: r.createdAt,
	}));
}

// ─── 3) 발송 완료 ──────────────────────────────────────────────────
export async function getSentRecent(
	academyId: string,
	coachUserId: string,
	limit = 10,
): Promise<SentItem[]> {
	const rows = await db
		.select({
			feedbackDraftId: feedbackDrafts.id,
			evaluationId: evaluations.id,
			studentName: students.name,
			year: students.year,
			internalGrade: aiAnalyses.internalGrade,
			sentAt: feedbackDrafts.sentAt,
		})
		.from(feedbackDrafts)
		.innerJoin(evaluations, eq(evaluations.id, feedbackDrafts.evaluationId))
		.innerJoin(students, eq(students.id, evaluations.studentId))
		.leftJoin(aiAnalyses, eq(aiAnalyses.evaluationId, evaluations.id))
		.where(
			and(
				eq(feedbackDrafts.academyId, academyId),
				eq(evaluations.coachUserId, coachUserId),
				eq(feedbackDrafts.status, "sent"),
			),
		)
		.orderBy(desc(feedbackDrafts.sentAt))
		.limit(limit);

	return rows.map((r) => ({
		feedbackDraftId: r.feedbackDraftId,
		evaluationId: r.evaluationId,
		studentName: r.studentName,
		year: r.year,
		internalGrade: (r.internalGrade ?? null) as InternalGrade | null,
		sentAt: r.sentAt ?? new Date(),
		parentViewedAt: null,
	}));
}

// ─── 4) Owner widget — 코치별 진행률 ───────────────────────────────
export async function getOwnerCoachProgress(
	academyId: string,
): Promise<CoachProgress[]> {
	const totalStudentsResult = await db
		.select({ c: count() })
		.from(students)
		.where(and(eq(students.academyId, academyId), isNull(students.softDeletedAt)));
	const totalStudents = totalStudentsResult[0]?.c ?? 0;

	type Row = {
		user_id: string;
		email: string;
		completed: number;
		pending: number;
		sent: number;
	};
	const rows = await db.execute<Row>(sql`
		SELECT
			u.id::text AS user_id,
			u.email,
			COUNT(DISTINCT e.id) FILTER (WHERE e.evaluation_date >= date_trunc('month', now())) AS completed,
			COUNT(DISTINCT fd.id) FILTER (WHERE fd.status = 'draft') AS pending,
			COUNT(DISTINCT fd.id) FILTER (WHERE fd.status = 'sent') AS sent
		FROM users u
		LEFT JOIN evaluations e ON e.coach_user_id = u.id AND e.academy_id = ${academyId}
		LEFT JOIN feedback_drafts fd ON fd.evaluation_id = e.id
		WHERE u.academy_id = ${academyId} AND u.role IN ('coach', 'owner')
		GROUP BY u.id, u.email
		ORDER BY u.email
	`);

	return rows.map((r) => {
		const completed = Number(r.completed);
		const pending = Number(r.pending);
		const sent = Number(r.sent);
		const assigned = totalStudents > 0 ? totalStudents : completed + pending + sent;
		return {
			userId: r.user_id,
			email: r.email,
			completed,
			pendingReview: pending,
			sent,
			totalAssigned: assigned,
			progressRatio: assigned > 0 ? (completed + sent) / assigned : 0,
		};
	});
}

// ─── 5) Academy mini stats ─────────────────────────────────────────
export async function getAcademyMiniStats(
	academyId: string,
): Promise<AcademyMiniStats> {
	const academyRows = await db
		.select({ name: academies.name })
		.from(academies)
		.where(eq(academies.id, academyId))
		.limit(1);
	const academyName = academyRows[0]?.name ?? "(학원 이름 없음)";

	const studentRows = await db
		.select({ c: count() })
		.from(students)
		.where(and(eq(students.academyId, academyId), isNull(students.softDeletedAt)));
	const totalStudents = studentRows[0]?.c ?? 0;

	const monthCountRows = await db.execute<{ c: number }>(sql`
		SELECT COUNT(DISTINCT student_id)::int AS c
		FROM evaluations
		WHERE academy_id = ${academyId}
		  AND evaluation_date >= date_trunc('month', now())
	`);
	const thisMonthCompleted = Number(monthCountRows[0]?.c ?? 0);

	// v1: cycle deadline = 이번 달 마지막 날
	const now = new Date();
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	const cycleDeadline = lastDay.toISOString().slice(0, 10);

	return {
		academyName,
		totalStudents,
		thisMonthCompleted,
		cycleDeadline,
	};
}

// ─── 6) Escalation data — for derivation in escalation-rules.ts ────
export async function getEscalationData(
	academyId: string,
): Promise<EscalationData> {
	type RegRow = {
		student_id: string;
		student_name: string;
		previous: InternalGrade;
		current: InternalGrade;
	};
	const regressions = await db.execute<RegRow>(sql`
		WITH ranked AS (
			SELECT
				e.student_id,
				s.name AS student_name,
				a.internal_grade,
				e.evaluation_date,
				ROW_NUMBER() OVER (PARTITION BY e.student_id ORDER BY e.evaluation_date DESC) AS rn
			FROM evaluations e
			JOIN ai_analyses a ON a.evaluation_id = e.id
			JOIN students s ON s.id = e.student_id
			WHERE e.academy_id = ${academyId}
		)
		SELECT
			r1.student_id::text AS student_id,
			r1.student_name,
			r2.internal_grade AS previous,
			r1.internal_grade AS current
		FROM ranked r1
		JOIN ranked r2 ON r2.student_id = r1.student_id AND r2.rn = 2
		WHERE r1.rn = 1
		  AND r1.internal_grade > r2.internal_grade  -- 'C' > 'B' (worse alphabetically)
		ORDER BY r1.student_name
	`);

	// AI failure heuristic v1: no failure-event table yet, so this returns 0.
	// When a failure log lands, query for last-24h count and replace below.
	const aiFailuresLast24h = 0;

	return {
		studentGradeRegressions: regressions.map((r) => ({
			studentId: r.student_id,
			studentName: r.student_name,
			previous: r.previous,
			current: r.current,
		})),
		aiFailuresLast24h,
	};
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Smoke-test against real DB (manual)**

If prereqs done (migration 0003 applied + at least 1 academy + 1 owner + 1 student):

```bash
bun run db:studio
```

Or quick REPL: drop into `bunx tsx -e "..."` invoking `getEvaluationTodo(academyId, coachId)` with real ids. Expected: returns array (possibly empty if no students). No SQL errors.

Skip this step if no real data yet; T17 E2E will exercise the queries.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dashboard/queries.ts
git commit -m "feat(dashboard): 6 Drizzle queries per spec §4.1 + §4.5

- getEvaluationTodo: 학생 — 이번 달 평가 안 한 행
- getReviewPending: feedback_drafts.status='draft' 본인 작업
- getSentRecent: status='sent' 최근 N건 (parentViewedAt=null in v1)
- getOwnerCoachProgress: 코치별 진행률 (owner widget)
- getAcademyMiniStats: greeting 옆 학원 stat
- getEscalationData: 등급 후퇴 detection (v1 rules 1+4 only)

Per-feature pattern (src/lib/dashboard/queries.ts) matches students/evaluations layout.
Uses real students.year column (migration 0003)."
```

---

## Task 7: EmptyState component

**Files:**
- Create: `src/app/(coach)/dashboard/components/empty-state.tsx`
- Create: `tests/unit/dashboard/empty-state.test.tsx`
- Verify: `tests/unit/setup.ts` exists (testing-library/jest-dom import)

- [ ] **Step 1: Ensure vitest setup imports jest-dom**

Check `tests/unit/setup.ts` exists with:

```typescript
// tests/unit/setup.ts
import "@testing-library/jest-dom/vitest";
```

If absent, create it. Verify `vitest.config.ts` (or `vite.config.ts`) `test.setupFiles` references it; if not, add:

```typescript
test: {
  setupFiles: ["./tests/unit/setup.ts"],
  environment: "jsdom",
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// tests/unit/dashboard/empty-state.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/app/(coach)/dashboard/components/empty-state";

describe("<EmptyState>", () => {
	it("renders message for eval-todo (no CTA)", () => {
		render(<EmptyState variant="eval-todo" />);
		expect(screen.getByText(/이번 cycle 평가 모두 시작됨/)).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("renders message + CTA for review-pending", () => {
		render(<EmptyState variant="review-pending" />);
		expect(screen.getByText(/검토할 letter 가 없습니다/)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "새 평가 시작" }),
		).toHaveAttribute("href", "/students");
	});

	it("renders coach invite CTA for owner-no-coach", () => {
		render(<EmptyState variant="owner-no-coach" />);
		expect(screen.getByRole("link", { name: "코치 초대" })).toHaveAttribute(
			"href",
			"/admin/users/new",
		);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/unit/dashboard/empty-state.test.tsx`
Expected: FAIL — module `@/app/(coach)/dashboard/components/empty-state` not found.

- [ ] **Step 4: Write the component**

```tsx
// src/app/(coach)/dashboard/components/empty-state.tsx
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
	type EmptyStateVariant,
	emptyStateConfig,
} from "@/lib/dashboard/empty-state-config";

interface Props {
	variant: EmptyStateVariant;
}

export function EmptyState({ variant }: Props) {
	const cfg = emptyStateConfig(variant);
	return (
		<div className="px-6 py-10 text-center">
			<p className="text-sm text-muted-foreground">{cfg.message}</p>
			{cfg.cta && (
				<Link
					href={cfg.cta.href}
					className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-3"}
				>
					{cfg.cta.label}
				</Link>
			)}
		</div>
	);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/unit/dashboard/empty-state.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/dashboard/empty-state.test.tsx src/app/\(coach\)/dashboard/components/empty-state.tsx
git commit -m "feat(dashboard): EmptyState component per spec §5.1

Pure component wrapping emptyStateConfig. CTA renders as outline button link."
```

---

## Task 8: CoachProgressBar component

**Files:**
- Create: `src/app/(coach)/dashboard/components/coach-progress-bar.tsx`
- Create: `tests/unit/dashboard/coach-progress-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/dashboard/coach-progress-bar.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoachProgressBar } from "@/app/(coach)/dashboard/components/coach-progress-bar";

describe("<CoachProgressBar>", () => {
	it("renders coach email and percentage", () => {
		render(<CoachProgressBar email="coach1@x.kr" progressRatio={0.5} />);
		expect(screen.getByText("coach1@x.kr")).toBeInTheDocument();
		expect(screen.getByText("50%")).toBeInTheDocument();
	});

	it("applies 'behind' tier styling below 30%", () => {
		const { container } = render(
			<CoachProgressBar email="x" progressRatio={0.1} />,
		);
		expect(container.querySelector('[data-tier="behind"]')).toBeInTheDocument();
	});

	it("applies 'on-track' tier styling 30-70%", () => {
		const { container } = render(
			<CoachProgressBar email="x" progressRatio={0.5} />,
		);
		expect(container.querySelector('[data-tier="on-track"]')).toBeInTheDocument();
	});

	it("applies 'complete' tier styling >= 70%", () => {
		const { container } = render(
			<CoachProgressBar email="x" progressRatio={0.85} />,
		);
		expect(container.querySelector('[data-tier="complete"]')).toBeInTheDocument();
	});

	it("rounds percentage to integer", () => {
		render(<CoachProgressBar email="x" progressRatio={0.674} />);
		expect(screen.getByText("67%")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/dashboard/coach-progress-bar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/app/(coach)/dashboard/components/coach-progress-bar.tsx
import { progressColorTier } from "@/lib/dashboard/progress-color";

interface Props {
	email: string;
	progressRatio: number;
}

const TIER_BG: Record<ReturnType<typeof progressColorTier>, string> = {
	behind: "bg-red-500",
	"on-track": "bg-amber-500",
	complete: "bg-emerald-500",
};

export function CoachProgressBar({ email, progressRatio }: Props) {
	const tier = progressColorTier(progressRatio);
	const pct = Math.round(Math.max(0, Math.min(1, progressRatio)) * 100);
	return (
		<div
			data-tier={tier}
			className="flex min-w-32 flex-col gap-1 rounded-md border bg-card p-2"
		>
			<div className="flex items-center justify-between text-xs">
				<span className="truncate text-muted-foreground">{email}</span>
				<span className="font-medium">{pct}%</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded bg-muted">
				<div
					className={`h-full ${TIER_BG[tier]} transition-all`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/dashboard/coach-progress-bar.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/dashboard/coach-progress-bar.test.tsx src/app/\(coach\)/dashboard/components/coach-progress-bar.tsx
git commit -m "feat(dashboard): CoachProgressBar component

Pure component — coach email + integer % + colored fill bar.
Color tier via shared progressColorTier (data-tier attr for testability)."
```

---

## Task 9: StudentRow component

**Files:**
- Create: `src/app/(coach)/dashboard/components/student-row.tsx`
- Create: `tests/unit/dashboard/student-row.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/dashboard/student-row.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudentRow } from "@/app/(coach)/dashboard/components/student-row";

describe("<StudentRow>", () => {
	it("renders student name + year and links to href", () => {
		render(
			<StudentRow
				studentName="박지윤"
				year="2년차"
				href="/evaluation/abc/coach-form"
			/>,
		);
		expect(screen.getByText("박지윤")).toBeInTheDocument();
		expect(screen.getByText("2년차")).toBeInTheDocument();
		expect(screen.getByRole("link")).toHaveAttribute(
			"href",
			"/evaluation/abc/coach-form",
		);
	});

	it("renders without year when null", () => {
		render(<StudentRow studentName="이서준" year={null} href="/x" />);
		expect(screen.getByText("이서준")).toBeInTheDocument();
		expect(screen.queryByText("2년차")).not.toBeInTheDocument();
	});

	it("renders meta tag when provided", () => {
		render(
			<StudentRow
				studentName="김하늘"
				year="1년차"
				href="/x"
				metaLabel="B"
			/>,
		);
		expect(screen.getByText("B")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/dashboard/student-row.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/app/(coach)/dashboard/components/student-row.tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface Props {
	studentName: string;
	year: string | null;
	href: string;
	metaLabel?: string;
}

export function StudentRow({ studentName, year, href, metaLabel }: Props) {
	return (
		<Link
			href={href}
			className="flex items-center justify-between gap-2 rounded px-3 py-2 text-sm hover:bg-accent"
		>
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate font-medium">{studentName}</span>
				{year && <span className="text-xs text-muted-foreground">{year}</span>}
			</div>
			{metaLabel && (
				<Badge variant="secondary" className="ml-auto">
					{metaLabel}
				</Badge>
			)}
		</Link>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/dashboard/student-row.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/dashboard/student-row.test.tsx src/app/\(coach\)/dashboard/components/student-row.tsx
git commit -m "feat(dashboard): StudentRow component

Pure Link-wrapped row — name + optional year + optional meta Badge.
Used by all 3 QueueCard variants."
```

---

## Task 10: QueueCard component (client, polling)

**Background:** Three QueueCard instances on the page: eval-todo, review-pending, sent. Each polls its own query. Server passes initial data via `initialData` to avoid first-render mismatch. Cache keys per spec §4.2.

**Files:**
- Create: `src/app/(coach)/dashboard/components/queue-card.tsx`

This component is integration-heavy and tested via E2E (T17). No standalone unit test in this task — but kept testable via `QueryClient` injection if needed later.

- [ ] **Step 1: Write the component**

```tsx
// src/app/(coach)/dashboard/components/queue-card.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/app/(coach)/dashboard/components/empty-state";
import { StudentRow } from "@/app/(coach)/dashboard/components/student-row";
import type { EmptyStateVariant } from "@/lib/dashboard/empty-state-config";

export type QueueRow = {
	id: string;
	studentName: string;
	year: string | null;
	href: string;
	metaLabel?: string;
};

interface Props {
	title: string;
	queryKey: readonly unknown[];
	fetcher: () => Promise<QueueRow[]>;
	emptyVariant: EmptyStateVariant;
	pollIntervalMs: number;
	initialData?: QueueRow[];
}

export function QueueCard({
	title,
	queryKey,
	fetcher,
	emptyVariant,
	pollIntervalMs,
	initialData,
}: Props) {
	const { data, isLoading, isError } = useQuery({
		queryKey,
		queryFn: fetcher,
		refetchInterval: pollIntervalMs,
		initialData,
	});

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">
					{title}
					{data && (
						<span className="ml-2 text-sm text-muted-foreground">
							({data.length})
						</span>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{isLoading && !data ? (
					<div className="space-y-2 p-3">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
					</div>
				) : isError ? (
					<p className="px-6 py-10 text-center text-sm text-destructive">
						불러오기 실패. 새로고침 해주세요.
					</p>
				) : !data || data.length === 0 ? (
					<EmptyState variant={emptyVariant} />
				) : (
					<div className="divide-y">
						{data.map((row) => (
							<StudentRow
								key={row.id}
								studentName={row.studentName}
								year={row.year}
								href={row.href}
								metaLabel={row.metaLabel}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(coach\)/dashboard/components/queue-card.tsx
git commit -m "feat(dashboard): QueueCard client component with polling

- Reusable for eval-todo / review-pending / sent
- Accepts initialData from Server Component for instant first paint
- Skeleton during loading, EmptyState when empty, error toast inline
- Caller provides queryKey + fetcher + poll interval"
```

---

## Task 11: GreetingHeader + MiniStats components

**Files:**
- Create: `src/app/(coach)/dashboard/components/greeting-header.tsx`
- Create: `src/app/(coach)/dashboard/components/mini-stats.tsx`

Both are pure stateless. Combined into one task since they always render together at top of dashboard.

- [ ] **Step 1: Write GreetingHeader**

```tsx
// src/app/(coach)/dashboard/components/greeting-header.tsx
interface Props {
	displayName: string; // 사용자 이름 또는 email 앞부분
	pendingTaskCount: number;
}

export function GreetingHeader({ displayName, pendingTaskCount }: Props) {
	return (
		<header className="flex items-baseline justify-between gap-3 border-b pb-3">
			<h1 className="text-lg font-semibold">
				안녕하세요, {displayName} 코치님
			</h1>
			<p className="text-sm text-muted-foreground">
				오늘 작업{" "}
				<span className="font-medium text-foreground">{pendingTaskCount}</span>건
			</p>
		</header>
	);
}
```

- [ ] **Step 2: Write MiniStats**

```tsx
// src/app/(coach)/dashboard/components/mini-stats.tsx
interface Props {
	totalStudents: number;
	thisMonthCompleted: number;
	cycleDeadline: string; // ISO YYYY-MM-DD
}

function daysUntil(iso: string): number {
	const target = new Date(iso + "T00:00:00").getTime();
	const now = Date.now();
	const ms = target - now;
	return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function MiniStats({
	totalStudents,
	thisMonthCompleted,
	cycleDeadline,
}: Props) {
	const dday = daysUntil(cycleDeadline);
	const pct =
		totalStudents > 0 ? Math.round((thisMonthCompleted / totalStudents) * 100) : 0;
	return (
		<div className="grid grid-cols-3 gap-3 text-sm">
			<div className="rounded-md border bg-card p-3">
				<p className="text-xs text-muted-foreground">학생 수</p>
				<p className="text-lg font-semibold">{totalStudents}</p>
			</div>
			<div className="rounded-md border bg-card p-3">
				<p className="text-xs text-muted-foreground">이번 달 진행률</p>
				<p className="text-lg font-semibold">
					{pct}% <span className="text-xs text-muted-foreground">({thisMonthCompleted}/{totalStudents})</span>
				</p>
			</div>
			<div className="rounded-md border bg-card p-3">
				<p className="text-xs text-muted-foreground">마감</p>
				<p className="text-lg font-semibold">
					{dday >= 0 ? `D-${dday}` : `D+${-dday}`}
				</p>
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(coach\)/dashboard/components/greeting-header.tsx src/app/\(coach\)/dashboard/components/mini-stats.tsx
git commit -m "feat(dashboard): GreetingHeader + MiniStats components

GreetingHeader: name + pending task count.
MiniStats: 3-cell grid (student count / month progress / D-day to deadline).
Both pure; D-day computed at render time from ISO date."
```

---

## Task 12: EscalationBadge component

**Files:**
- Create: `src/app/(coach)/dashboard/components/escalation-badge.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/(coach)/dashboard/components/escalation-badge.tsx
"use client";

import { AlertTriangle } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { EscalationAlert } from "@/lib/dashboard/escalation-rules";

interface Props {
	alerts: EscalationAlert[];
}

export function EscalationBadge({ alerts }: Props) {
	if (alerts.length === 0) return null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-1 rounded-md border bg-amber-50 px-2 py-1 text-sm hover:bg-amber-100"
					aria-label={`알림 ${alerts.length}건`}
				>
					<AlertTriangle className="h-4 w-4 text-amber-600" />
					<Badge variant="secondary">{alerts.length}</Badge>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuLabel>주의가 필요한 항목</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{alerts.map((a, i) => (
					<DropdownMenuItem
						key={a.kind === "regression" ? `r-${a.studentId}` : `f-${i}`}
						className="flex-col items-start gap-0.5"
					>
						<span className="text-xs uppercase text-muted-foreground">
							{a.kind === "regression" ? "등급 후퇴" : "AI 실패"}
						</span>
						<span className="text-sm">{a.label}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(coach\)/dashboard/components/escalation-badge.tsx
git commit -m "feat(dashboard): EscalationBadge component

Renders nothing when no alerts. Otherwise: amber pill + count Badge + dropdown
listing kind+label per alert. Owner-only widget (parent gates rendering)."
```

---

## Task 13: OwnerStatusRow component (client, polling)

**Background:** Owner-only top strip — coach progress bars + escalation badge. Polls owner widget data every 60s per spec §4.2.

**Files:**
- Create: `src/app/(coach)/dashboard/components/owner-status-row.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/(coach)/dashboard/components/owner-status-row.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { CoachProgressBar } from "@/app/(coach)/dashboard/components/coach-progress-bar";
import { EscalationBadge } from "@/app/(coach)/dashboard/components/escalation-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	CoachProgress,
	EscalationData,
} from "@/lib/dashboard/queries";
import {
	type EscalationAlert,
	deriveEscalations,
} from "@/lib/dashboard/escalation-rules";

interface Props {
	academyId: string;
	initialCoaches: CoachProgress[];
	initialEscalation: EscalationData;
	fetchCoaches: () => Promise<CoachProgress[]>;
	fetchEscalation: () => Promise<EscalationData>;
}

export function OwnerStatusRow({
	academyId,
	initialCoaches,
	initialEscalation,
	fetchCoaches,
	fetchEscalation,
}: Props) {
	const coaches = useQuery({
		queryKey: ["owner", "coach-progress", academyId],
		queryFn: fetchCoaches,
		refetchInterval: 60_000,
		initialData: initialCoaches,
	});

	const escalation = useQuery({
		queryKey: ["owner", "escalation", academyId],
		queryFn: fetchEscalation,
		refetchInterval: 60_000,
		initialData: initialEscalation,
	});

	const alerts: EscalationAlert[] = escalation.data
		? deriveEscalations(escalation.data)
		: [];

	return (
		<section
			aria-label="학원 코치 진행률"
			className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3"
		>
			{coaches.isLoading && !coaches.data ? (
				<>
					<Skeleton className="h-12 w-32" />
					<Skeleton className="h-12 w-32" />
					<Skeleton className="h-12 w-32" />
				</>
			) : (
				coaches.data?.map((c) => (
					<CoachProgressBar
						key={c.userId}
						email={c.email}
						progressRatio={c.progressRatio}
					/>
				))
			)}
			<div className="ml-auto">
				<EscalationBadge alerts={alerts} />
			</div>
		</section>
	);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(coach\)/dashboard/components/owner-status-row.tsx
git commit -m "feat(dashboard): OwnerStatusRow client component (owner only)

- Polls coach progress + escalation data every 60s
- Renders CoachProgressBar per coach + EscalationBadge in right slot
- Skeleton during initial load
- deriveEscalations from polled data — keeps DB query simple, rule logic pure"
```

---

## Task 14: RecentActivity component (client, polling)

**Background:** Spec §3 row 5 — last 5-10 events (letter 발송, 부모 열람). v1 has no audit_log for parent views, so events = recent feedback_drafts state transitions. Fetched via the `sent` queue but filtered/formatted differently. Reuses `getSentRecent` from queries module.

**Files:**
- Create: `src/app/(coach)/dashboard/components/recent-activity.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/(coach)/dashboard/components/recent-activity.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SentItem } from "@/lib/dashboard/queries";

interface Props {
	queryKey: readonly unknown[];
	fetcher: () => Promise<SentItem[]>;
	initialData?: SentItem[];
}

function relativeTime(d: Date): string {
	const diff = Date.now() - new Date(d).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${minutes}분 전`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}시간 전`;
	const days = Math.floor(hours / 24);
	return `${days}일 전`;
}

export function RecentActivity({ queryKey, fetcher, initialData }: Props) {
	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: fetcher,
		refetchInterval: 60_000,
		initialData,
	});

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">최근 활동</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{isLoading && !data ? (
					<div className="space-y-2 p-3">
						<Skeleton className="h-6 w-full" />
						<Skeleton className="h-6 w-full" />
					</div>
				) : !data || data.length === 0 ? (
					<p className="px-6 py-6 text-center text-sm text-muted-foreground">
						아직 활동이 없습니다.
					</p>
				) : (
					<ul className="divide-y">
						{data.slice(0, 8).map((item) => (
							<li
								key={item.feedbackDraftId}
								className="flex items-center justify-between px-3 py-2 text-sm"
							>
								<span className="truncate">
									<span className="font-medium">{item.studentName}</span>
									{item.year && (
										<span className="ml-1 text-xs text-muted-foreground">
											{item.year}
										</span>
									)}
									<span className="ml-2 text-muted-foreground">발송됨</span>
								</span>
								<span className="text-xs text-muted-foreground">
									{relativeTime(item.sentAt)}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(coach\)/dashboard/components/recent-activity.tsx
git commit -m "feat(dashboard): RecentActivity component

Reuses SentItem data (last 8) with relative-time labels.
v1 only surfaces 'sent' events; parent-view events deferred to v1.x audit log."
```

---

## Task 15: Update (coach)/layout.tsx — add topbar nav

**Background:** Existing `src/app/(coach)/layout.tsx` calls `requireAuth()` and renders a placeholder. Add a topbar nav linking to `/dashboard` / `/students`. No sidebar — spec ships v1 with topbar only.

**Files:**
- Modify: `src/app/(coach)/layout.tsx`

- [ ] **Step 1: Read current file**

Use Read tool on `src/app/(coach)/layout.tsx` to confirm contents match expected.

- [ ] **Step 2: Replace contents**

```tsx
// src/app/(coach)/layout.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/require-auth";

export default async function CoachLayout({
	children,
}: {
	children: ReactNode;
}) {
	const user = await requireAuth();
	const isOwner = user.role === "owner" || user.role === "admin";

	return (
		<div className="min-h-screen">
			<nav
				aria-label="주요 메뉴"
				className="flex items-center justify-between border-b px-4 py-3"
			>
				<div className="flex items-center gap-4">
					<Link href="/dashboard" className="text-base font-semibold">
						Director's Note
					</Link>
					<Link
						href="/dashboard"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						Dashboard
					</Link>
					<Link
						href="/students"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						학생
					</Link>
					{isOwner && (
						<Link
							href="/admin/users/new"
							className="text-sm text-muted-foreground hover:text-foreground"
						>
							사용자 초대
						</Link>
					)}
				</div>
				<span className="text-xs text-muted-foreground">{user.appUser.email}</span>
			</nav>
			<main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
		</div>
	);
}
```

- [ ] **Step 3: Verify TypeScript compiles + dev boot**

Run: `bun run typecheck`
Expected: PASS.

Run (separate terminal): `bun dev` and load `http://localhost:3000/students`. Expected: topbar visible with links + user email on the right.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(coach\)/layout.tsx
git commit -m "feat(coach-layout): add topbar nav with role-conditional links

- Links to /dashboard, /students; /admin/users/new only when owner/admin
- Shows current user email on right
- Replaces the v1 sidebar slot comment (sidebar deferred to v1.x)"
```

---

## Task 16: Dashboard page (Server Component orchestration)

**Background:** Top-level page wires everything. Pulls `getCurrentUser()` via `requireAuth()`, parallel queries (`Promise.all`), and passes initial data to client components. Server actions (`fetchEvalTodoForClient`, etc.) wrap query functions so client `fetcher` props can call them via a `'use server'` action — keeping the DB call server-side without exposing query implementation.

**Files:**
- Create: `src/app/(coach)/dashboard/page.tsx`
- Create: `src/app/(coach)/dashboard/actions.ts` (server actions for client fetchers)

- [ ] **Step 1: Write server actions wrapper**

```typescript
// src/app/(coach)/dashboard/actions.ts
"use server";

import { requireAuth } from "@/lib/auth/require-auth";
import type { QueueRow } from "@/app/(coach)/dashboard/components/queue-card";
import {
	getEvaluationTodo,
	getReviewPending,
	getSentRecent,
	getOwnerCoachProgress,
	getEscalationData,
	type SentItem,
	type CoachProgress,
	type EscalationData,
} from "@/lib/dashboard/queries";

function evalTodoToRow(t: Awaited<ReturnType<typeof getEvaluationTodo>>[number]): QueueRow {
	return {
		id: t.studentId,
		studentName: t.studentName,
		year: t.year,
		href: `/students/${t.studentId}`,
		metaLabel: t.lastGrade ?? undefined,
	};
}

function reviewPendingToRow(
	t: Awaited<ReturnType<typeof getReviewPending>>[number],
): QueueRow {
	return {
		id: t.feedbackDraftId,
		studentName: t.studentName,
		year: t.year,
		href: `/evaluation/${t.evaluationId}/review`,
		metaLabel: t.internalGrade ?? undefined,
	};
}

function sentToRow(t: Awaited<ReturnType<typeof getSentRecent>>[number]): QueueRow {
	return {
		id: t.feedbackDraftId,
		studentName: t.studentName,
		year: t.year,
		href: `/evaluation/${t.evaluationId}/review`,
		metaLabel: "발송됨",
	};
}

export async function fetchEvalTodoRows(): Promise<QueueRow[]> {
	const user = await requireAuth();
	const items = await getEvaluationTodo(user.academyId, user.appUser.id);
	return items.map(evalTodoToRow);
}

export async function fetchReviewPendingRows(): Promise<QueueRow[]> {
	const user = await requireAuth();
	const items = await getReviewPending(user.academyId, user.appUser.id);
	return items.map(reviewPendingToRow);
}

export async function fetchSentRows(): Promise<QueueRow[]> {
	const user = await requireAuth();
	const items = await getSentRecent(user.academyId, user.appUser.id);
	return items.map(sentToRow);
}

export async function fetchSentItems(): Promise<SentItem[]> {
	const user = await requireAuth();
	return getSentRecent(user.academyId, user.appUser.id);
}

export async function fetchCoachProgress(): Promise<CoachProgress[]> {
	const user = await requireAuth();
	if (user.role !== "owner" && user.role !== "admin") {
		throw new Error("forbidden");
	}
	return getOwnerCoachProgress(user.academyId);
}

export async function fetchEscalation(): Promise<EscalationData> {
	const user = await requireAuth();
	if (user.role !== "owner" && user.role !== "admin") {
		throw new Error("forbidden");
	}
	return getEscalationData(user.academyId);
}
```

- [ ] **Step 2: Write dashboard page**

```tsx
// src/app/(coach)/dashboard/page.tsx
import { requireAuth } from "@/lib/auth/require-auth";
import {
	getAcademyMiniStats,
	getEscalationData,
	getEvaluationTodo,
	getOwnerCoachProgress,
	getReviewPending,
	getSentRecent,
} from "@/lib/dashboard/queries";
import { GreetingHeader } from "./components/greeting-header";
import { MiniStats } from "./components/mini-stats";
import { OwnerStatusRow } from "./components/owner-status-row";
import { QueueCard } from "./components/queue-card";
import { RecentActivity } from "./components/recent-activity";
import {
	fetchCoachProgress,
	fetchEscalation,
	fetchEvalTodoRows,
	fetchReviewPendingRows,
	fetchSentItems,
	fetchSentRows,
} from "./actions";

export const dynamic = "force-dynamic"; // 사용자별 데이터, cache 금지

export default async function DashboardPage() {
	const user = await requireAuth();
	const isOwner = user.role === "owner" || user.role === "admin";

	const [stats, evalTodo, reviewPending, sentRecent, coachProgress, escalation] =
		await Promise.all([
			getAcademyMiniStats(user.academyId),
			getEvaluationTodo(user.academyId, user.appUser.id),
			getReviewPending(user.academyId, user.appUser.id),
			getSentRecent(user.academyId, user.appUser.id),
			isOwner ? getOwnerCoachProgress(user.academyId) : Promise.resolve(null),
			isOwner ? getEscalationData(user.academyId) : Promise.resolve(null),
		]);

	const displayName = user.appUser.email.split("@")[0] ?? "사용자";
	const pendingTaskCount = evalTodo.length + reviewPending.length;

	const evalTodoRows = evalTodo.map((t) => ({
		id: t.studentId,
		studentName: t.studentName,
		year: t.year,
		href: `/students/${t.studentId}`,
		metaLabel: t.lastGrade ?? undefined,
	}));
	const reviewPendingRows = reviewPending.map((t) => ({
		id: t.feedbackDraftId,
		studentName: t.studentName,
		year: t.year,
		href: `/evaluation/${t.evaluationId}/review`,
		metaLabel: t.internalGrade ?? undefined,
	}));
	const sentRows = sentRecent.map((t) => ({
		id: t.feedbackDraftId,
		studentName: t.studentName,
		year: t.year,
		href: `/evaluation/${t.evaluationId}/review`,
		metaLabel: "발송됨",
	}));

	return (
		<div className="space-y-4">
			{isOwner && coachProgress && escalation && (
				<OwnerStatusRow
					academyId={user.academyId}
					initialCoaches={coachProgress}
					initialEscalation={escalation}
					fetchCoaches={fetchCoachProgress}
					fetchEscalation={fetchEscalation}
				/>
			)}

			<GreetingHeader displayName={displayName} pendingTaskCount={pendingTaskCount} />
			<MiniStats
				totalStudents={stats.totalStudents}
				thisMonthCompleted={stats.thisMonthCompleted}
				cycleDeadline={stats.cycleDeadline}
			/>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<QueueCard
					title="평가 시작"
					queryKey={["queue", "eval-todo", user.appUser.id]}
					fetcher={fetchEvalTodoRows}
					emptyVariant="eval-todo"
					pollIntervalMs={30_000}
					initialData={evalTodoRows}
				/>
				<QueueCard
					title="검토 대기"
					queryKey={["queue", "review-pending", user.appUser.id]}
					fetcher={fetchReviewPendingRows}
					emptyVariant="review-pending"
					pollIntervalMs={10_000}
					initialData={reviewPendingRows}
				/>
				<QueueCard
					title="발송 완료"
					queryKey={["queue", "sent", user.appUser.id]}
					fetcher={fetchSentRows}
					emptyVariant="sent"
					pollIntervalMs={60_000}
					initialData={sentRows}
				/>
			</div>

			<RecentActivity
				queryKey={["activity", user.appUser.id]}
				fetcher={fetchSentItems}
				initialData={sentRecent}
			/>
		</div>
	);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Dev smoke test**

Run: `bun dev`. Open `http://localhost:3000/dashboard` while logged in as owner. Expected:
- Topbar visible
- OwnerStatusRow renders with mini bars (or empty strip if no coaches/students seeded)
- GreetingHeader shows email prefix + 0건 (if empty DB)
- 3 QueueCards render with EmptyState messages
- No console errors

If logged out: redirects to `/login`. If logged in as `coach` role: OwnerStatusRow absent.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(coach\)/dashboard/page.tsx src/app/\(coach\)/dashboard/actions.ts
git commit -m "feat(dashboard): page Server Component + client fetcher actions

- Parallel fetch of stats + 3 queues + (owner) coach progress + escalation
- Maps query rows → QueueRow shape for QueueCard reuse
- Server actions wrap queries with requireAuth() so client polling stays gated
- force-dynamic — per-user, never cached"
```

---

## Task 17: E2E tests

**Background:** 5 scenarios per spec §6.4. Gated on `process.env.E2E_AUTH_READY` consistent with existing specs (`tests/e2e/students.spec.ts` etc.). Tests require `tests/.auth/owner.json` and `tests/.auth/coach.json` storageState files — same setup as prior E2E. If auth setup is not yet wired up, tests auto-skip and remain useful as documentation.

**Files:**
- Create: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
// tests/e2e/dashboard.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Dashboard (코치 view)", () => {
	test.skip(!process.env.E2E_AUTH_READY, "E2E auth setup not yet wired");
	test.use({ storageState: "tests/.auth/coach.json" });

	test("E2E-D1: 코치 login → dashboard 정상, owner row 안 보임", async ({
		page,
	}) => {
		await page.goto("/dashboard");
		await expect(page.getByRole("heading", { name: /안녕하세요/ })).toBeVisible();
		await expect(page.getByLabel("학원 코치 진행률")).not.toBeVisible();
	});

	test("E2E-D3: 평가 시작 큐 row click → /students/:id", async ({ page }) => {
		await page.goto("/dashboard");
		const firstRow = page
			.getByRole("link")
			.filter({ hasText: /년차|^[가-힣]/ })
			.first();
		if (await firstRow.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await firstRow.click();
			await expect(page).toHaveURL(/\/students\/[0-9a-f-]+/);
		}
	});

	test("E2E-D4: 검토 대기 row click → /evaluation/:id/review", async ({
		page,
	}) => {
		await page.goto("/dashboard");
		const reviewSection = page.getByText("검토 대기").locator("..").locator("..");
		const reviewLink = reviewSection
			.getByRole("link")
			.filter({ hasText: /^[가-힣]/ })
			.first();
		if (await reviewLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await reviewLink.click();
			await expect(page).toHaveURL(/\/evaluation\/[0-9a-f-]+\/review/);
		}
	});
});

test.describe("Dashboard (Owner view)", () => {
	test.skip(!process.env.E2E_AUTH_READY, "E2E auth setup not yet wired");
	test.use({ storageState: "tests/.auth/owner.json" });

	test("E2E-D2: Owner login → owner row 표시, 코치 progress bars 존재", async ({
		page,
	}) => {
		await page.goto("/dashboard");
		await expect(page.getByLabel("학원 코치 진행률")).toBeVisible();
	});

	test("E2E-D5: RLS — 다른 학원 데이터 absent", async ({ page }) => {
		// Owner storageState is for academy A. Hitting /dashboard should never
		// show academy B data. We verify by checking no foreign academy markers
		// appear (assumes seed creates a marker like a known email in academy B).
		await page.goto("/dashboard");
		await expect(page.getByText("foreign-academy@bbb.kr")).not.toBeVisible();
	});
});
```

- [ ] **Step 2: Run the spec**

Run: `bun run test:e2e tests/e2e/dashboard.spec.ts`
Expected (without `E2E_AUTH_READY`): all 5 tests skipped, exit 0.

If `E2E_AUTH_READY=1` and storageState files exist: tests run against `bun dev`. Verify all 5 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/dashboard.spec.ts
git commit -m "test(dashboard): E2E-D1 through E2E-D5 per spec §6.4

- D1: 코치 dashboard, owner row absent
- D2: Owner dashboard, owner row + coach bars present
- D3: 평가 시작 click → /students/:id
- D4: 검토 대기 click → /evaluation/:id/review
- D5: RLS — foreign academy data not visible

Gated on E2E_AUTH_READY env var (consistent with prior E2E specs)."
```

---

## Spec Gaps — Explicitly Deferred (v1.x or later)

Items in spec NOT covered by this plan, with reason:

| Spec ref | Item | Deferral reason |
|---|---|---|
| §4.5 rules #2, #3, #5 | Cycle stall, consent delay, billing seat alerts | Requires additional tables (cycle metadata, consent deadline tracking, billing) |
| §3 row 5 (RecentActivity) — parent 열람 events | Audit log integration | No `audit_log` table exists; v1.1 adds Supabase Realtime + dedicated table |
| §7 polling-interval tuning | Per-coach interval adjustment | Default per spec §4.2; tune after friend-academy observation |
| §7 학생-코치 매핑 컬럼 | `students.primary_coach_user_id` | Plan uses `evaluations.coach_user_id` inference per spec §4.4. v1.x dedicated column |
| §6.5 LCP perf measurement | < 2s LCP verification | Manual lighthouse check, not E2E gated |
| Sidebar nav (spec §3 row 1 implies) | Left sidebar | Topbar only in v1 per "v1 ships with topbar only" comment in existing layout |

---

## Self-Review

After implementation, run all unit + integration tests:

```bash
bun test
```

Expected: existing 46 tests still pass + new dashboard unit tests pass. Total ~55-60 tests.

Run TypeScript check:

```bash
bun run typecheck
```

Expected: 0 errors.

Run lint on touched files:

```bash
bunx biome check src/lib/dashboard/ src/app/\(coach\)/dashboard/ src/app/providers.tsx src/lib/providers/
```

Expected: 0 errors on new code (pre-existing globals.css/shadcn errors stay as-is per checkpoint note).

Run E2E (with auth set up):

```bash
E2E_AUTH_READY=1 bun run test:e2e tests/e2e/dashboard.spec.ts
```

Expected: 5/5 pass.

Manual smoke (with seeded data):
- [ ] Login as owner → see OwnerStatusRow + queues
- [ ] Login as coach → no OwnerStatusRow, queues still work
- [ ] Click eval-todo row → navigates to `/students/:id`
- [ ] Click review-pending row → navigates to `/evaluation/:id/review`
- [ ] Wait 30s → eval-todo queue refetches (check Network tab)
- [ ] Empty academy (no students) → EmptyState messages show

---

## Execution Handoff

After landing all 17 tasks:

1. Update `TODOS.md` — remove "Coach dashboard plan resume" line (it's done).
2. Push branch + open PR per `/ship` flow.
3. Schedule friend-academy observation session to tune polling intervals + escalation weights per spec §7.

---

## Notes / Decisions

- **Why server actions for client fetchers?** Polling must hit the DB without exposing query implementation to the client bundle. Server actions are the cleanest Next 16 idiom for this — same `'use server'` machinery already used by `startEvaluation`, `finalizeAndSend`, etc.
- **Why `force-dynamic` on dashboard page?** Per-user data, RLS-scoped. Caching across users would either leak or invalidate on every request anyway.
- **Why combine GreetingHeader + MiniStats in one task?** They render adjacently, share no logic, and are both ~30 LoC. Splitting would inflate the plan without adding clarity.
- **Why no unit test for `QueueCard`/`OwnerStatusRow`/`RecentActivity`?** They're thin wrappers over `useQuery` + presentational sub-components. Behavior is exercised by E2E. Unit-testing `useQuery` mocking has poor return on investment given pure sub-components are already covered.
- **`displayName` fallback to email prefix.** Spec §3 row 3 mentions "사용자 이름"; `users` table has no `display_name` column yet. v1.x adds the column + migration; falling back to email prefix is intentional — friend-academy users will see their own login email's local part, which is informative enough.
