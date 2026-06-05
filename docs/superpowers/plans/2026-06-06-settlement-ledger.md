# Settlement Ledger (evaluator earnings accrual) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** released 시 primary 평가자에게 ₩6,000 적립하고 환불 시 void하는 정산 원장(`evaluator_earnings`)을 만든다. 지급(송금/원천징수)은 비범위.

**Architecture:** `evaluator_earnings` 테이블 + `src/lib/settlement/` 모듈(accrue/void/list). release-action이 적립을, refundOrder가 void를 호출(둘 다 실패 격리). 적립은 `UNIQUE(submission_id, evaluator_user_id)` + onConflictDoNothing으로 멱등.

**Tech Stack:** Next.js 16, Drizzle/postgres-js, Vitest.

---

## File Structure

- **Create** `migrations/0023_evaluator_earnings.sql`, `migrations/0024_evaluator_earnings_rls.sql`
- **Modify** `src/lib/db/schema.ts` — `evaluatorEarnings` 테이블
- **Create** `src/lib/settlement/config.ts` — `EVALUATOR_FEE_KRW`
- **Create** `src/lib/settlement/actions.ts` — `accrueEarning`/`voidEarningsForSubmission`/`listEarnings`
- **Modify** `src/lib/submissions/release-action.ts` — 적립 훅
- **Modify** `src/lib/payments/actions.ts` — refundOrder void 훅
- **Tests** — config(unit), settlement+hooks(integration)

---

## Task 1: 마이그레이션 0023 + schema

**Files:** `migrations/0023_evaluator_earnings.sql`, `src/lib/db/schema.ts`

- [ ] **Step 1: 마이그레이션 작성**

Create `migrations/0023_evaluator_earnings.sql`:

```sql
-- 0023_evaluator_earnings.sql
-- 적용 시점: 0022 이후. D-③(b) 정산 원장(적립). 지급(c)은 별도.
-- Source: docs/superpowers/specs/2026-06-06-settlement-ledger-design.md
-- release 시 primary 평가자에게 적립(pending), 환불 시 void. UNIQUE 로 멱등.

BEGIN;

CREATE TABLE evaluator_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  payment_order_id uuid REFERENCES payment_orders(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','void','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  CONSTRAINT evaluator_earnings_submission_evaluator_unique UNIQUE (submission_id, evaluator_user_id)
);
CREATE INDEX idx_evaluator_earnings_evaluator_status ON evaluator_earnings(evaluator_user_id, status);

COMMIT;
```

- [ ] **Step 2: schema.ts에 테이블 추가**

`src/lib/db/schema.ts`의 `paymentOrders` 테이블 정의 다음(relations 앞)에 추가. 이미 import된 `check/index/integer/text/timestamp/uuid/unique/pgTable/sql` 사용, TABS:

```ts
// ─── evaluator_earnings (정산 원장 — 0023) ─────────────────────────
export const evaluatorEarnings = pgTable(
	"evaluator_earnings",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		evaluatorUserId: uuid("evaluator_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => submissions.id, { onDelete: "cascade" }),
		paymentOrderId: uuid("payment_order_id").references(
			() => paymentOrders.id,
			{ onDelete: "set null" },
		),
		amount: integer("amount").notNull(),
		status: text("status")
			.$type<"pending" | "void" | "paid">()
			.notNull()
			.default("pending"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		voidedAt: timestamp("voided_at", { withTimezone: true }),
	},
	(t) => [
		unique("evaluator_earnings_submission_evaluator_unique").on(
			t.submissionId,
			t.evaluatorUserId,
		),
		check(
			"evaluator_earnings_status_enum",
			sql`${t.status} IN ('pending','void','paid')`,
		),
		index("idx_evaluator_earnings_evaluator_status").on(
			t.evaluatorUserId,
			t.status,
		),
	],
);
```

- [ ] **Step 3: typecheck**

Run: `bun run typecheck` → PASS

- [ ] **Step 4: dev DB 적용은 컨트롤러가 수행** (psql 부재 — postgres-js). 실행자는 적용하지 말고 보고만.

- [ ] **Step 5: commit**

```bash
git add migrations/0023_evaluator_earnings.sql src/lib/db/schema.ts
git commit -m "feat(settlement): 0023 evaluator_earnings table"
```

---

## Task 2: 마이그레이션 0024 (RLS)

**Files:** `migrations/0024_evaluator_earnings_rls.sql`

- [ ] **Step 1: 작성**

Create `migrations/0024_evaluator_earnings_rls.sql`:

```sql
-- 0024_evaluator_earnings_rls.sql
-- 적용 시점: 0023 이후. 정산 원장 RLS. 평가자 본인 적립만 SELECT. write 는 시스템.

BEGIN;

ALTER TABLE evaluator_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY evaluator_earnings_owner_select ON evaluator_earnings
  FOR SELECT USING (evaluator_user_id = auth.uid());

COMMIT;
```

- [ ] **Step 2: dev DB 적용은 컨트롤러가 수행** (보고만)

- [ ] **Step 3: commit**

```bash
git add migrations/0024_evaluator_earnings_rls.sql
git commit -m "feat(settlement): 0024 evaluator_earnings RLS (owner-only select)"
```

---

## Task 3: settlement config + actions

**Files:** `src/lib/settlement/config.ts`, `src/lib/settlement/actions.ts`, `tests/unit/settlement/config.test.ts`, `tests/integration/settlement/actions.test.ts`

- [ ] **Step 1: config 실패 테스트**

Create `tests/unit/settlement/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EVALUATOR_FEE_KRW } from "@/lib/settlement/config";

describe("settlement config", () => {
	it("평가자 적립 단가는 6000원(정수)", () => {
		expect(EVALUATOR_FEE_KRW).toBe(6000);
		expect(Number.isInteger(EVALUATOR_FEE_KRW)).toBe(true);
	});
});
```

- [ ] **Step 2: run → FAIL**

Run: `bun run test:ci tests/unit/settlement/config.test.ts`

- [ ] **Step 3: config.ts**

Create `src/lib/settlement/config.ts`:

```ts
// 평가자 1건(primary 채점) 적립 단가(원, 정수). 원장 행에 스냅샷 저장하므로 변경해도 과거 적립 불변.
export const EVALUATOR_FEE_KRW = 6000;
```

- [ ] **Step 4: actions.ts**

Create `src/lib/settlement/actions.ts`:

```ts
"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluatorEarnings } from "@/lib/db/schema";
import { EVALUATOR_FEE_KRW } from "@/lib/settlement/config";

// release 시 primary 평가자에게 ₩6,000 적립(pending). UNIQUE(submission,evaluator) 로 멱등.
export async function accrueEarning(input: {
	submissionId: string;
	evaluatorUserId: string;
	paymentOrderId?: string | null;
}): Promise<void> {
	await db
		.insert(evaluatorEarnings)
		.values({
			submissionId: input.submissionId,
			evaluatorUserId: input.evaluatorUserId,
			paymentOrderId: input.paymentOrderId ?? null,
			amount: EVALUATOR_FEE_KRW,
		})
		.onConflictDoNothing({
			target: [
				evaluatorEarnings.submissionId,
				evaluatorEarnings.evaluatorUserId,
			],
		});
}

// 환불 시 해당 제출의 pending 적립을 void. 멱등(pending 행만).
export async function voidEarningsForSubmission(
	submissionId: string,
): Promise<void> {
	await db
		.update(evaluatorEarnings)
		.set({ status: "void", voidedAt: new Date() })
		.where(
			and(
				eq(evaluatorEarnings.submissionId, submissionId),
				eq(evaluatorEarnings.status, "pending"),
			),
		);
}

export type EarningRow = {
	id: string;
	submissionId: string;
	amount: number;
	status: "pending" | "void" | "paid";
	createdAt: Date;
};

// 평가자 본인/관리자 조회용(후속 UI 대비). 직결 db.
export async function listEarnings(
	evaluatorUserId: string,
): Promise<EarningRow[]> {
	return db
		.select({
			id: evaluatorEarnings.id,
			submissionId: evaluatorEarnings.submissionId,
			amount: evaluatorEarnings.amount,
			status: evaluatorEarnings.status,
			createdAt: evaluatorEarnings.createdAt,
		})
		.from(evaluatorEarnings)
		.where(eq(evaluatorEarnings.evaluatorUserId, evaluatorUserId))
		.orderBy(desc(evaluatorEarnings.createdAt));
}
```

- [ ] **Step 5: config 통과**

Run: `bun run test:ci tests/unit/settlement/config.test.ts` → PASS

- [ ] **Step 6: DB-gated 통합 테스트**

Create `tests/integration/settlement/actions.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
	},
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("settlement actions (DB)", () => {
	let seed: typeof import("../_seed");
	let mod: typeof import("@/lib/settlement/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		mod = await import("@/lib/settlement/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("accrueEarning → pending 6000, 재호출 멱등(중복 행 없음)", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
		});

		await mod.accrueEarning({ submissionId, evaluatorUserId: evaluator.id });
		await mod.accrueEarning({ submissionId, evaluatorUserId: evaluator.id }); // 멱등

		const rows = await seed.pg`
			SELECT amount, status FROM evaluator_earnings
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${evaluator.id}`;
		expect(rows.length).toBe(1);
		expect(rows[0].amount).toBe(6000);
		expect(rows[0].status).toBe("pending");
	});

	it("voidEarningsForSubmission → pending→void(voided_at), 재호출 no-op", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
		});
		await mod.accrueEarning({ submissionId, evaluatorUserId: evaluator.id });

		await mod.voidEarningsForSubmission(submissionId);
		const v = await seed.pg`
			SELECT status, voided_at FROM evaluator_earnings WHERE submission_id = ${submissionId}`;
		expect(v[0].status).toBe("void");
		expect(v[0].voided_at).not.toBeNull();

		// 재호출 no-op (이미 void)
		await mod.voidEarningsForSubmission(submissionId);
		const v2 = await seed.pg`
			SELECT status FROM evaluator_earnings WHERE submission_id = ${submissionId}`;
		expect(v2[0].status).toBe("void");
	});

	it("listEarnings → 본인 적립 반환", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
		});
		await mod.accrueEarning({ submissionId, evaluatorUserId: evaluator.id });

		const list = await mod.listEarnings(evaluator.id);
		expect(list.some((e) => e.submissionId === submissionId && e.amount === 6000)).toBe(true);
	});
});
```

- [ ] **Step 7: 통합 통과 (dev DB, 직렬)**

Run: `set -a; . ./.env.local; set +a; ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration/settlement/actions.test.ts --no-file-parallelism`
Expected: PASS (3). guard off → SKIPPED. DB 불가 시 보고.

- [ ] **Step 8: typecheck + lint + commit**

Run: `bun run typecheck && bun run lint` → PASS
```bash
git add src/lib/settlement/config.ts src/lib/settlement/actions.ts tests/unit/settlement/config.test.ts tests/integration/settlement/actions.test.ts
git commit -m "feat(settlement): config + accrue/void/list actions"
```

---

## Task 4: 훅 연결 (release 적립 / refund void)

**Files:** `src/lib/submissions/release-action.ts`, `src/lib/payments/actions.ts`, `tests/integration/settlement/hooks.test.ts`

- [ ] **Step 1: release-action.ts 적립 훅**

`src/lib/submissions/release-action.ts` 상단 import에 추가:
```ts
import { accrueEarning } from "@/lib/settlement/actions";
```
함수 내부에서 `let primaryEvaluatorId: string | null = null;` 를 try 블록 앞에 선언. 트랜잭션 안의 primaryLabel 조회를 evaluatorUserId 포함으로 확장하고, is_primary 셋 시 캡처. 현재 코드:
```ts
				const primaryLabel = await tx
					.select({ id: labeledResults.id })
					.from(labeledResults)
```
를
```ts
				const primaryLabel = await tx
					.select({
						id: labeledResults.id,
						evaluatorUserId: labeledResults.evaluatorUserId,
					})
					.from(labeledResults)
```
로 바꾸고, 기존
```ts
				if (primaryLabel[0]) {
					await tx
						.update(labeledResults)
						.set({ isPrimary: true })
						.where(eq(labeledResults.id, primaryLabel[0].id));
				}
```
를
```ts
				if (primaryLabel[0]) {
					primaryEvaluatorId = primaryLabel[0].evaluatorUserId;
					await tx
						.update(labeledResults)
						.set({ isPrimary: true })
						.where(eq(labeledResults.id, primaryLabel[0].id));
				}
```
로 바꾼다. try/catch 블록 다음, `return { ok: true, alreadyReleased: false };` 바로 앞에 적립(실패 격리):
```ts
	// 정산 적립 — primary 평가자에게 수익 적립. 실패해도 release 를 깨지 않음.
	if (primaryEvaluatorId) {
		try {
			await accrueEarning({ submissionId, evaluatorUserId: primaryEvaluatorId });
		} catch (e) {
			console.error("[release] accrueEarning failed", e);
		}
	}

	return { ok: true, alreadyReleased: false };
```
(`let primaryEvaluatorId` 선언은 try 위. `labeledResults` 는 이미 import됨.)

- [ ] **Step 2: refundOrder void 훅**

`src/lib/payments/actions.ts` 상단 import에 추가:
```ts
import { voidEarningsForSubmission } from "@/lib/settlement/actions";
```
`refundOrder` 의 재잠금 두 업데이트 다음, `return { ok: true };` 바로 앞에 추가(실패 격리):
```ts
	// 정산 void — 환불된 건은 지급 대상 아님. 실패해도 환불을 깨지 않음.
	try {
		await voidEarningsForSubmission(order.submissionId);
	} catch (e) {
		console.error("[refund] voidEarningsForSubmission failed", e);
	}

	return { ok: true };
```

- [ ] **Step 3: typecheck**

Run: `bun run typecheck` → PASS

- [ ] **Step 4: DB-gated 통합 테스트 (release 적립 / refund void end-to-end)**

Create `tests/integration/settlement/hooks.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
		FEATURE_PAYMENT_ENABLED: "false",
		KAKAO_PAY_SECRET_KEY: undefined,
		KAKAO_PAY_CID: undefined,
	},
}));
// release/refund 둘 다 getCurrentUser 로 인가. 시드 사용자로 대체.
let currentUserId = "";
let currentRole = "consumer";
vi.mock("@/lib/auth/current-user", () => ({
	getCurrentUser: async () => ({
		appUser: { id: currentUserId, role: currentRole },
	}),
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("settlement hooks (release accrue / refund void)", () => {
	let seed: typeof import("../_seed");
	let release: typeof import("@/lib/submissions/release-action");
	let payments: typeof import("@/lib/payments/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		release = await import("@/lib/submissions/release-action");
		payments = await import("@/lib/payments/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("release → primary 평가자 earning pending 적립", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "scored",
			paidAt: true,
		});
		await seed.seedAssignment(submissionId, evaluator.id, false, "submitted");
		await seed.seedLabel(submissionId, evaluator.id, {});

		currentUserId = consumer.id; // release 소유자 = consumer
		currentRole = "consumer";
		const r = await release.releaseSubmission(submissionId);
		expect(r.ok).toBe(true);

		const e = await seed.pg`
			SELECT amount, status FROM evaluator_earnings
			WHERE submission_id = ${submissionId} AND evaluator_user_id = ${evaluator.id}`;
		expect(e.length).toBe(1);
		expect(e[0].amount).toBe(6000);
		expect(e[0].status).toBe("pending");
	});

	it("refund → 해당 적립 void", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "released",
			paidAt: true,
		});
		await seed.seedAssignment(submissionId, evaluator.id, false, "submitted");
		await seed.seedLabel(submissionId, evaluator.id, { isPrimary: true });
		// 적립 시드(release 거치지 않고 직접)
		await seed.pg`
			INSERT INTO evaluator_earnings (evaluator_user_id, submission_id, amount, status)
			VALUES (${evaluator.id}, ${submissionId}, 6000, 'pending')`;
		// approved 주문 시드
		const ord = await seed.pg`
			INSERT INTO payment_orders (submission_id, user_id, amount, provider, provider_tid, status, approved_at)
			VALUES (${submissionId}, ${consumer.id}, 9900, 'stub', 'stub_x', 'approved', now())
			RETURNING id`;

		currentUserId = "admin-1";
		currentRole = "admin"; // refund 는 admin
		const r = await payments.refundOrder(ord[0].id as string);
		expect(r.ok).toBe(true);

		const e = await seed.pg`
			SELECT status FROM evaluator_earnings WHERE submission_id = ${submissionId}`;
		expect(e[0].status).toBe("void");
	});
});
```

- [ ] **Step 5: 통합 통과 (dev DB, 직렬)**

Run: `set -a; . ./.env.local; set +a; ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration/settlement/hooks.test.ts --no-file-parallelism`
Expected: PASS (2). DB 불가 시 보고.
> seedLabel 시그니처 확인: `seedLabel(submissionId, evaluatorId, { isPrimary?, grade? })` (tests/integration/_seed.ts). isPrimary 옵션이 없으면 release 가 자체적으로 is_primary 를 셋하므로 첫 테스트는 옵션 없이 OK.

- [ ] **Step 6: 회귀 — 기존 release/payment/refund 통합 유지**

Run: `set -a; . ./.env.local; set +a; RLS_TEST_DB=1 ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration --no-file-parallelism 2>&1 | tail -4`
Expected: 전부 PASS.

- [ ] **Step 7: lint + commit**

Run: `bun run lint` → PASS
```bash
git add src/lib/submissions/release-action.ts src/lib/payments/actions.ts tests/integration/settlement/hooks.test.ts
git commit -m "feat(settlement): wire release accrue + refund void hooks"
```

---

## Task 5: 전체 검증 + work-log

**Files:** `work-log/2026-06-06 정산 원장 구현.md`

- [ ] **Step 1: 전체 게이트**

Run: `bun run typecheck && bun run lint && bun run test:ci 2>&1 | tail -6`
Expected: typecheck/lint PASS; 단위 PASS(config 1 추가), DB-gated skip.

- [ ] **Step 2: DB-gated 직렬**

Run: `set -a; . ./.env.local; set +a; RLS_TEST_DB=1 ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration --no-file-parallelism 2>&1 | tail -4`
Expected: 전부 PASS(settlement 5 포함).

- [ ] **Step 3: 빌드**

Run: `bun run build 2>&1 | grep -E "Compiled|error|Error|failed" | head`
Expected: Compiled successfully.

- [ ] **Step 4: work-log 작성**

Create `work-log/2026-06-06 정산 원장 구현.md` — 만든 것/검증/체크리스트:
- evaluator_earnings 원장(0023)+RLS(0024), accrue(release)/void(refund), ₩6,000 primary only, 멱등, 실패 격리.
- 비범위/차단: 지급(c) — 송금·3.3% 원천징수·지급명세서·계좌/주민번호 수집(PIPA).
- prod DB 0023·0024 적용(dev=prod 동일 ref).
- DB-gated 테스트 `--no-file-parallelism`.

- [ ] **Step 5: commit**

```bash
git add "work-log/2026-06-06 정산 원장 구현.md"
git commit -m "docs(work-log): 2026-06-06 정산 원장 구현"
```

---

## Self-Review (작성자 점검 완료)

- **Spec coverage:** §4 흐름(Task 4 훅), §5 DB(Task 1·2), §6 모듈(Task 3), §7 훅(Task 4), §8 멱등/보안(Task 3 onConflictDoNothing·void pending-only·실패격리), §9 테스트(Task 3·4), §10 사이드이펙트(실패격리·회귀 Step). 누락 없음.
- **Placeholder scan:** 없음 — 모든 코드/명령 구체화.
- **Type consistency:** `accrueEarning`/`voidEarningsForSubmission`/`listEarnings`/`EarningRow`/`EVALUATOR_FEE_KRW` Task 3 정의 → Task 4 훅에서 동일 사용. 테이블/컬럼 0023↔schema↔쿼리 일치. `evaluatorEarnings` import 일관.
- **주의:** (1) 0023/0024 컨트롤러가 postgres-js 적용. (2) DB-gated `--no-file-parallelism`. (3) release 훅은 primaryEvaluatorId 캡처 후 tx 밖 실패격리 호출. (4) refund 훅은 기존 refundOrder 끝에 void 추가.
