# Timeout Reassignment Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 assignment sweep 함수(`expireOverdueAssignments`, `assignQueued`)를 Vercel Cron(daily)으로 배선해 타임아웃 재배정을 자동화한다.

**Architecture:** 새 비즈니스 로직 없음. `GET /api/cron/sweep-assignments` route handler가 `CRON_SECRET` bearer 토큰을 검증하고 두 sweep을 (expire → queued 순으로) 호출, 결과를 JSON으로 반환한다. `vercel.json`의 `crons`가 daily(`0 18 * * *` UTC = KST 03:00)로 호출한다.

**Tech Stack:** Next.js 16 App Router (route handler), t3-env, Drizzle/postgres-js, Vitest, Vercel Cron.

---

## File Structure

- **Create** `src/app/api/cron/sweep-assignments/route.ts` — cron 엔드포인트(인증 + sweep 호출 + 결과).
- **Create** `tests/unit/api/cron/sweep-assignments.test.ts` — 인증 분기 + 실행 순서 + 실패 처리(sweep 모킹).
- **Create** `tests/integration/assignment/cron-sweep.test.ts` — 실DB 만료→재배정 검증(DB-gated).
- **Modify** `src/lib/env.ts` — server env `CRON_SECRET` 추가.
- **Modify** `vercel.json` — `crons` 배열 추가.
- **Modify** `tests/integration/_seed.ts:116-128` — `seedAssignment`에 overdue 옵션 추가(후방호환).

기존 sweep 함수(`src/lib/assignment/actions.ts`)는 **수정하지 않는다.**

---

## Task 1: env에 CRON_SECRET 추가

**Files:**
- Modify: `src/lib/env.ts:23` (server 블록 끝), `src/lib/env.ts:45` (runtimeEnv 끝)

- [ ] **Step 1: server 스키마에 CRON_SECRET 추가**

`src/lib/env.ts`의 server 객체에서 `FEATURE_PAYMENT_ENABLED` 줄 바로 다음에 추가:

```ts
		FEATURE_PAYMENT_ENABLED: z.enum(["true", "false"]).default("false"),
		// Vercel Cron 인증 시크릿. Vercel이 cron 호출 시
		// `Authorization: Bearer ${CRON_SECRET}` 를 자동 첨부한다 (/api/cron/*).
		CRON_SECRET: z.string().min(1),
```

- [ ] **Step 2: runtimeEnv 매핑 추가**

`src/lib/env.ts`의 runtimeEnv 객체에서 `FEATURE_PAYMENT_ENABLED` 매핑 줄 다음에 추가:

```ts
		FEATURE_PAYMENT_ENABLED: process.env.FEATURE_PAYMENT_ENABLED,
		CRON_SECRET: process.env.CRON_SECRET,
```

- [ ] **Step 3: typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat(cron): add CRON_SECRET server env for cron auth"
```

---

## Task 2: cron route handler (인증 분기 — 실패 테스트 먼저)

**Files:**
- Create: `tests/unit/api/cron/sweep-assignments.test.ts`
- Create: `src/app/api/cron/sweep-assignments/route.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/unit/api/cron/sweep-assignments.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// t3-env throws on server-var access under vitest (jsdom=client). Mock it.
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-secret" } }));

// Mock the sweeps so this unit test stays DB-free; capture call order.
const expireOverdueAssignments = vi.fn();
const assignQueued = vi.fn();
vi.mock("@/lib/assignment/actions", () => ({
	expireOverdueAssignments: () => expireOverdueAssignments(),
	assignQueued: () => assignQueued(),
}));

import { GET } from "@/app/api/cron/sweep-assignments/route";

const reqWith = (auth?: string) =>
	new Request("http://localhost/api/cron/sweep-assignments", {
		headers: auth ? { authorization: auth } : {},
	});

describe("GET /api/cron/sweep-assignments", () => {
	beforeEach(() => {
		expireOverdueAssignments.mockReset();
		assignQueued.mockReset();
		expireOverdueAssignments.mockResolvedValue({
			ok: true,
			processed: 0,
			assigned: 0,
		});
		assignQueued.mockResolvedValue({ ok: true, processed: 0, assigned: 0 });
	});

	it("missing Authorization → 401, sweeps not called", async () => {
		const res = await GET(reqWith());
		expect(res.status).toBe(401);
		expect(expireOverdueAssignments).not.toHaveBeenCalled();
		expect(assignQueued).not.toHaveBeenCalled();
	});

	it("wrong token → 401", async () => {
		const res = await GET(reqWith("Bearer wrong"));
		expect(res.status).toBe(401);
		expect(expireOverdueAssignments).not.toHaveBeenCalled();
	});

	it("valid token → 200, runs expire BEFORE queued, returns both results", async () => {
		const order: string[] = [];
		expireOverdueAssignments.mockImplementation(async () => {
			order.push("expire");
			return { ok: true, processed: 2, assigned: 1 };
		});
		assignQueued.mockImplementation(async () => {
			order.push("queued");
			return { ok: true, processed: 1, assigned: 1 };
		});

		const res = await GET(reqWith("Bearer test-secret"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({
			ok: true,
			expired: { ok: true, processed: 2, assigned: 1 },
			queued: { ok: true, processed: 1, assigned: 1 },
		});
		expect(order).toEqual(["expire", "queued"]);
	});

	it("a sweep returning {ok:false} → 500 with details", async () => {
		expireOverdueAssignments.mockResolvedValue({ ok: false, error: "boom" });
		const res = await GET(reqWith("Bearer test-secret"));
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.ok).toBe(false);
		expect(body.error).toBe("sweep_failed");
		expect(body.expired).toEqual({ ok: false, error: "boom" });
	});
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `bun run test:ci tests/unit/api/cron/sweep-assignments.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/cron/sweep-assignments/route'`

- [ ] **Step 3: route handler 구현**

Create `src/app/api/cron/sweep-assignments/route.ts`:

```ts
import {
	assignQueued,
	expireOverdueAssignments,
} from "@/lib/assignment/actions";
import { env } from "@/lib/env";

// DB 직결(postgres-js) 사용 → Node 런타임 필수. 캐시 금지.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// daily 단발 + 파일럿 볼륨이라 sweep 은 빠르다. 60s 면 충분.
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
	// Vercel Cron 은 호출 시 `Authorization: Bearer ${CRON_SECRET}` 를 자동 첨부한다.
	// 동일 토큰으로 admin 수동 호출도 가능. 불일치/누락 → 401(외부 무단 호출 차단).
	if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}

	// expire 먼저: 만료 primary 를 queued 로 환원하고 만료 평가자 제외 재배정.
	// 그다음 assignQueued: 환원분 + intake 시점 미배정분을 픽업.
	// 두 sweep 모두 멱등 — 동시/중복 실행에 안전.
	const expired = await expireOverdueAssignments();
	const queued = await assignQueued();

	if (!expired.ok || !queued.ok) {
		console.error("[cron/sweep-assignments] sweep failed", { expired, queued });
		return Response.json(
			{ ok: false, error: "sweep_failed", expired, queued },
			{ status: 500 },
		);
	}

	console.info("[cron/sweep-assignments] ok", { expired, queued });
	return Response.json({ ok: true, expired, queued });
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `bun run test:ci tests/unit/api/cron/sweep-assignments.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: lint**

Run: `bun run lint`
Expected: PASS (no errors in new files)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/sweep-assignments/route.ts tests/unit/api/cron/sweep-assignments.test.ts
git commit -m "feat(cron): sweep-assignments route — auth + expire/queued sweeps"
```

---

## Task 3: vercel.json cron 등록

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: crons 배열 추가**

`vercel.json` 전체를 다음으로 교체:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["icn1"],
  "crons": [
    { "path": "/api/cron/sweep-assignments", "schedule": "0 18 * * *" }
  ]
}
```

> `0 18 * * *` 는 UTC 18:00 = KST 03:00(오프피크). Vercel cron schedule 은 UTC 기준.

- [ ] **Step 2: JSON 유효성 확인**

Run: `bun -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(cron): schedule sweep-assignments daily (KST 03:00)"
```

---

## Task 4: seedAssignment에 overdue 옵션 추가

**Files:**
- Modify: `tests/integration/_seed.ts:116-128`

- [ ] **Step 1: seedAssignment 시그니처에 overdue 추가**

`tests/integration/_seed.ts` 의 `seedAssignment` 를 다음으로 교체(후방호환 — 기존 호출부는 5번째 인자 생략):

```ts
/** Insert an assignment directly (service-role-style write; bypasses RLS).
 *  overdue=true → due_at 을 과거로(now() - 1h) 세팅해 만료 sweep 대상으로 만든다. */
export async function seedAssignment(
	submissionId: string,
	evaluatorId: string,
	isRedundant: boolean,
	status: "assigned" | "submitted" | "expired" | "reassigned" = "assigned",
	overdue = false,
): Promise<string> {
	const rows = await pg`
		INSERT INTO evaluation_assignments
			(submission_id, evaluator_user_id, due_at, status, is_redundant_label)
		VALUES (${submissionId}, ${evaluatorId},
			${overdue ? pg`now() - interval '1 hour'` : pg`now() + interval '48 hours'`},
			${status}, ${isRedundant})
		RETURNING id`;
	return rows[0].id as string;
}
```

- [ ] **Step 2: typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: 기존 통합테스트 회귀 없음 확인(스킵 상태여도 컴파일 검증)**

Run: `bun run test:ci tests/integration/assignment/score-submit.test.ts`
Expected: PASS or SKIPPED (no compile error)

- [ ] **Step 4: Commit**

```bash
git add tests/integration/_seed.ts
git commit -m "test(seed): seedAssignment overdue option for expiry sweep tests"
```

---

## Task 5: cron route 통합테스트 (실DB, DB-gated)

**Files:**
- Create: `tests/integration/assignment/cron-sweep.test.ts`

- [ ] **Step 1: 통합테스트 작성**

Create `tests/integration/assignment/cron-sweep.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real sweeps + real DB; only env is mocked (t3-env client-env guard).
// CRON_SECRET added so the route's auth check passes.
vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
		FEATURE_PAYMENT_ENABLED: process.env.FEATURE_PAYMENT_ENABLED ?? "false",
		CRON_SECRET: "test-secret",
	},
}));

const skip =
	!process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

const authedReq = () =>
	new Request("http://localhost/api/cron/sweep-assignments", {
		headers: { authorization: "Bearer test-secret" },
	});

describe.skipIf(skip)("cron sweep route — expire + reassign + pickup", () => {
	let seed: typeof import("../_seed");
	let GET: typeof import("@/app/api/cron/sweep-assignments/route").GET;
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		({ GET } = await import("@/app/api/cron/sweep-assignments/route"));
		scope = seed.newScope();
	});

	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("overdue primary → expired; submission reverted and reassigned to a different evaluator", async () => {
		const s = scope;
		const consumer = await seed.seedUser(s, "consumer");
		const e1 = await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		const e2 = await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		const submissionId = await seed.seedSubmission(s, consumer.id, {
			status: "assigned",
		});
		// e1 holds an overdue primary assignment.
		await seed.seedAssignment(submissionId, e1.id, false, "assigned", true);

		const res = await GET(authedReq());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);

		// e1's assignment is now expired.
		const e1Rows = await seed.pg`
			SELECT status FROM evaluation_assignments
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
		expect(e1Rows[0].status).toBe("expired");

		// Exactly one active primary, now on e2 (e1 excluded on reassign).
		const active = await seed.pg`
			SELECT evaluator_user_id FROM evaluation_assignments
			WHERE submission_id = ${submissionId}
			  AND status = 'assigned' AND is_redundant_label = false`;
		expect(active.length).toBe(1);
		expect(active[0].evaluator_user_id).toBe(e2.id);

		// Submission flipped back to 'assigned' after reassignment.
		const sub = await seed.pg`
			SELECT status FROM submissions WHERE id = ${submissionId}`;
		expect(sub[0].status).toBe("assigned");
	});

	it("no overdue assignments → 200, nothing changes", async () => {
		const s = scope;
		const consumer = await seed.seedUser(s, "consumer");
		const e1 = await seed.seedUser(s, "evaluator", { evaluatorActive: true });
		const submissionId = await seed.seedSubmission(s, consumer.id, {
			status: "assigned",
		});
		// future-due assignment (overdue defaults to false).
		await seed.seedAssignment(submissionId, e1.id, false, "assigned");

		const res = await GET(authedReq());
		expect(res.status).toBe(200);

		const rows = await seed.pg`
			SELECT status FROM evaluation_assignments
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${e1.id}`;
		expect(rows[0].status).toBe("assigned");
	});
});
```

- [ ] **Step 2: 가드 OFF에서 skip 확인**

Run: `bun run test:ci tests/integration/assignment/cron-sweep.test.ts`
Expected: SKIPPED (ASSIGNMENT_TEST_DB 미설정)

- [ ] **Step 3: 가드 ON에서 통과 확인 (dev DB 필요)**

Run: `RLS_TEST_DB=1 ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration/assignment/cron-sweep.test.ts`
Expected: PASS (2 tests)

> dev DB가 없거나 접속 불가하면 이 스텝은 보류하고 실행자에게 보고. skip(Step 2)은 반드시 통과해야 한다.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/assignment/cron-sweep.test.ts
git commit -m "test(cron): integration — overdue assignment expire+reassign via route"
```

---

## Task 6: 전체 검증 + 배포 체크리스트 기록

**Files:**
- (코드 변경 없음 — 검증·문서)

- [ ] **Step 1: 전체 단위/통합(가드 OFF) 테스트**

Run: `bun run test:ci`
Expected: PASS (기존 200 + 신규 cron 단위 4). 가드 OFF라 DB 통합은 skip.

- [ ] **Step 2: typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: 둘 다 PASS

- [ ] **Step 3: 배포 체크리스트 문서화**

work-log에 배포 시 수동 단계 기록(아래 항목). 별도 파일이 아니라면
`work-log/2026-06-05 타임아웃 재배정 cron 배선.md` 생성:

- Vercel 프로젝트 env 에 `CRON_SECRET`(랜덤 32+ 문자) 추가 — 미설정 시 t3-env가 빌드 실패시켜 배포 전 감지됨.
- 배포 후 Vercel 대시보드 → Cron Jobs 에서 `/api/cron/sweep-assignments` daily 등록 확인.
- 수동 트리거 검증: `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/cron/sweep-assignments` → 200 + `{ok:true,...}`.

- [ ] **Step 4: Commit (사용자 명시 요청 시에만)**

> 프로젝트 규칙: 임의 커밋 금지. work-log 커밋은 사용자 확인 후.

```bash
git add work-log/
git commit -m "docs(work-log): 2026-06-05 타임아웃 재배정 cron 배선"
```

---

## Self-Review (작성자 점검 완료)

- **Spec coverage:** §3 아키텍처(Task 2 route), §4-1 인증(Task 1 env + Task 2 검증), §4-2 실행순서(Task 2 order 테스트), §4-3 타임존(Task 3), §4-4 관측성(console 로그 + JSON), §4-5 수동 트리거 겸용(동일 엔드포인트, 주석), §4-6 에러 격리(500 분기 + `.ok` 검사), §5 인터페이스 계약(Task 2 테스트로 401/200/500 전부 커버), §6 테스트(Task 2/5), §7 사이드이펙트(sweep 미변경 + CRON_SECRET 빌드 가드 + Task 6 배포 체크리스트). 누락 없음.
- **Placeholder scan:** 없음 — 모든 코드/명령 구체화.
- **Type consistency:** route는 `SweepResult`(`{ok,processed,assigned}|{ok:false,error}`)를 그대로 패스스루. 함수명 `expireOverdueAssignments`/`assignQueued` 실제 export와 일치. `seedAssignment` 5-인자 시그니처 Task4↔Task5 일치. env 키 `CRON_SECRET` Task1↔Task2↔Task5 일치.
