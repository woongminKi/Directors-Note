# Consumer Payment (KakaoPay, pay-to-unlock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소비자 실결제(카카오페이 단건결제) 토대를 구현 — 주문/거래 모델 + provider 추상화 + ready→approve 리다이렉트 흐름, 승인 시 `submissions.paid_at` 스탬프 후 기존 `releaseSubmission()` 로 결과 공개.

**Architecture:** `PaymentProvider` 추상화(KakaoPay 실구현 + Stub 무료파일럿) + `payment_orders` 테이블. `payReady` 가 주문 생성+provider.ready → KakaoPay 결제창 리다이렉트 → `/api/payments/kakao/approve` 콜백이 `approveOrder` 호출 → provider.approve 성공 시 paid_at 스탬프 + release. 가격은 서버 config(₩9,900), 금액은 주문에 저장.

**Tech Stack:** Next.js 16 App Router, Drizzle/postgres-js, KakaoPay Online single payment API, t3-env, Vitest.

---

## File Structure

- **Create** `src/lib/payments/config.ts` — `SUBMISSION_PRICE_KRW`
- **Create** `src/lib/payments/types.ts` — `PaymentProvider`, 결과/행 타입
- **Create** `src/lib/payments/stub-provider.ts` — `StubPaymentProvider`
- **Create** `src/lib/payments/kakaopay-provider.ts` — `KakaoPayProvider`
- **Create** `src/lib/payments/factory.ts` — `createPaymentProvider`, `isKakaoPayEnabled`
- **Create** `src/lib/payments/actions.ts` — `payReady`, `approveOrder`
- **Create** `src/app/api/payments/kakao/approve/route.ts` — 승인 콜백
- **Create** `migrations/0020_payment_orders.sql`, `migrations/0021_payment_orders_rls.sql`
- **Modify** `src/lib/db/schema.ts` — `paymentOrders` 테이블
- **Modify** `src/lib/env.ts` — `KAKAO_PAY_SECRET_KEY`, `KAKAO_PAY_CID`
- **Modify** `src/app/(consumer)/submissions/[id]/pay-button.tsx` — 리다이렉트 흐름
- **Tests** — 각 태스크 명시

기존 `payForSubmission`(payment-action.ts)·`releaseSubmission`·`checkReleaseGate` 는 미변경(재사용).

---

## Task 1: env — KakaoPay 키

**Files:** `src/lib/env.ts`

- [ ] **Step 1: server 스키마 추가**

`src/lib/env.ts` server 객체에서 알림톡 stub 키들 다음(또는 `FEATURE_PAYMENT_ENABLED` 근처)에 추가:

```ts
		// 카카오페이 단건결제 (D-③ 소비자 결제). FEATURE_PAYMENT_ENABLED=true 일 때 사용.
		KAKAO_PAY_SECRET_KEY: z.string().optional(),
		KAKAO_PAY_CID: z.string().optional(),
```

- [ ] **Step 2: runtimeEnv 매핑 추가**

```ts
		KAKAO_PAY_SECRET_KEY: process.env.KAKAO_PAY_SECRET_KEY,
		KAKAO_PAY_CID: process.env.KAKAO_PAY_CID,
```

- [ ] **Step 3: typecheck + commit**

Run: `bun run typecheck` → PASS
```bash
git add src/lib/env.ts
git commit -m "feat(payment): add KakaoPay env vars"
```

---

## Task 2: 마이그레이션 0020 + schema.ts

**Files:** `migrations/0020_payment_orders.sql`, `src/lib/db/schema.ts`

- [ ] **Step 1: 마이그레이션 작성**

Create `migrations/0020_payment_orders.sql`:

```sql
-- 0020_payment_orders.sql
-- 적용 시점: 0019 이후. D-③ 소비자 결제(카카오페이) 주문/거래.
-- Source: docs/superpowers/specs/2026-06-05-consumer-payment-kakaopay-design.md
-- paid_at(unlock 신호)는 submissions 에 유지. 금액/거래 상세는 여기에.
-- 관례: 0014 따름.

BEGIN;

CREATE TABLE payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount integer NOT NULL,
  provider text NOT NULL CHECK (provider IN ('kakaopay','stub')),
  provider_tid text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','approved','canceled','failed')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_orders_submission ON payment_orders(submission_id);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);

COMMIT;
```

- [ ] **Step 2: schema.ts에 테이블 추가**

`src/lib/db/schema.ts`의 `notifications` 테이블 정의 다음(relations 앞)에 추가. 이미 import 된 `check/index/integer/text/timestamp/uuid/pgTable/sql` 사용, TABS:

```ts
// ─── payment_orders (소비자 결제 주문/거래 — 0020) ─────────────────
export const paymentOrders = pgTable(
	"payment_orders",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => submissions.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		amount: integer("amount").notNull(),
		provider: text("provider").$type<"kakaopay" | "stub">().notNull(),
		providerTid: text("provider_tid"),
		status: text("status")
			.$type<"ready" | "approved" | "canceled" | "failed">()
			.notNull()
			.default("ready"),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check(
			"payment_orders_provider_enum",
			sql`${t.provider} IN ('kakaopay','stub')`,
		),
		check(
			"payment_orders_status_enum",
			sql`${t.status} IN ('ready','approved','canceled','failed')`,
		),
		index("idx_payment_orders_submission").on(t.submissionId),
		index("idx_payment_orders_status").on(t.status),
	],
);
```

- [ ] **Step 3: typecheck**

Run: `bun run typecheck` → PASS

- [ ] **Step 4: dev DB 적용 (psql 부재 — postgres-js)**

> 컨트롤러 주: psql 미설치 환경. 다음으로 적용(BEGIN 포함 → `max:1`, `.simple()`):
```
set -a; . ./.env.local; set +a
bun -e 'import postgres from "postgres"; import {readFileSync} from "node:fs"; const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1}); await sql.unsafe(readFileSync("migrations/0020_payment_orders.sql","utf8")).simple(); await sql.end(); console.log("applied 0020")'
```
실행자(서브에이전트)가 psql 없으면 보고만 하고 컨트롤러가 적용.

- [ ] **Step 5: commit**

```bash
git add migrations/0020_payment_orders.sql src/lib/db/schema.ts
git commit -m "feat(payment): 0020 payment_orders table"
```

---

## Task 3: 마이그레이션 0021 (RLS)

**Files:** `migrations/0021_payment_orders_rls.sql`

- [ ] **Step 1: 작성**

Create `migrations/0021_payment_orders_rls.sql`:

```sql
-- 0021_payment_orders_rls.sql
-- 적용 시점: 0020 이후. payment_orders RLS.
-- 본인 주문만 SELECT(authenticated). write 는 시스템(service-role/직결 db, RLS bypass).

BEGIN;

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_orders_owner_select ON payment_orders
  FOR SELECT USING (user_id = auth.uid());

COMMIT;
```

- [ ] **Step 2: dev DB 적용** (컨트롤러; Task 2 Step 4 방식과 동일, 파일명만 0021)

- [ ] **Step 3: commit**

```bash
git add migrations/0021_payment_orders_rls.sql
git commit -m "feat(payment): 0021 payment_orders RLS (owner-only select)"
```

---

## Task 4: 가격 config + 결제 타입

**Files:** `src/lib/payments/config.ts`, `src/lib/payments/types.ts`, `tests/unit/payments/config.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `tests/unit/payments/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SUBMISSION_PRICE_KRW } from "@/lib/payments/config";

describe("payment config", () => {
	it("기본 가격은 9900원(정수)", () => {
		expect(SUBMISSION_PRICE_KRW).toBe(9900);
		expect(Number.isInteger(SUBMISSION_PRICE_KRW)).toBe(true);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/unit/payments/config.test.ts` → FAIL (module 없음)

- [ ] **Step 3: config.ts**

Create `src/lib/payments/config.ts`:

```ts
// 평가 1건 소비자 가격(원, 정수). 주문 레코드에 금액을 저장하므로 변경해도 과거 주문 불변.
export const SUBMISSION_PRICE_KRW = 9900;
```

- [ ] **Step 4: types.ts**

Create `src/lib/payments/types.ts`:

```ts
export type PaymentProviderName = "kakaopay" | "stub";
export type PaymentOrderStatus = "ready" | "approved" | "canceled" | "failed";

export type PaymentOrderRow = {
	id: string;
	submissionId: string;
	userId: string;
	amount: number;
	provider: PaymentProviderName;
	providerTid: string | null;
	status: PaymentOrderStatus;
};

export type ReadyContext = {
	itemName: string;
	partnerUserId: string;
	approvalUrl: string;
	cancelUrl: string;
	failUrl: string;
};

export type ReadyResult =
	| { ok: true; tid: string; redirectUrl: string }
	| { ok: false; error: string };

export type ApproveResult = { ok: true } | { ok: false; error: string };

export interface PaymentProvider {
	ready(order: PaymentOrderRow, ctx: ReadyContext): Promise<ReadyResult>;
	approve(order: PaymentOrderRow, pgToken: string): Promise<ApproveResult>;
	// cancel(order): 환불 — 후속 사이클.
}
```

- [ ] **Step 5: 통과 + commit**

Run: `bun run test:ci tests/unit/payments/config.test.ts` → PASS
```bash
git add src/lib/payments/config.ts src/lib/payments/types.ts tests/unit/payments/config.test.ts
git commit -m "feat(payment): price config + provider types"
```

---

## Task 5: Stub provider + factory (TDD)

**Files:** `src/lib/payments/stub-provider.ts`, `src/lib/payments/factory.ts`, `tests/unit/payments/factory.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `tests/unit/payments/factory.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: {
		FEATURE_PAYMENT_ENABLED: "false",
		KAKAO_PAY_SECRET_KEY: undefined,
		KAKAO_PAY_CID: undefined,
		NEXT_PUBLIC_APP_URL: "http://localhost:3000",
	},
}));

import {
	createPaymentProvider,
	isKakaoPayEnabled,
} from "@/lib/payments/factory";
import { StubPaymentProvider } from "@/lib/payments/stub-provider";

describe("payment factory", () => {
	it("flag off → Stub, isKakaoPayEnabled false", () => {
		expect(isKakaoPayEnabled()).toBe(false);
		expect(createPaymentProvider()).toBeInstanceOf(StubPaymentProvider);
	});
});

describe("StubPaymentProvider", () => {
	it("ready → 결과 페이지 redirect, approve → ok", async () => {
		const p = new StubPaymentProvider();
		const order = {
			id: "o1",
			submissionId: "s1",
			userId: "u1",
			amount: 9900,
			provider: "stub" as const,
			providerTid: null,
			status: "ready" as const,
		};
		const r = await p.ready(order, {
			itemName: "x",
			partnerUserId: "u1",
			approvalUrl: "a",
			cancelUrl: "c",
			failUrl: "f",
		});
		expect(r).toEqual({
			ok: true,
			tid: "stub_o1",
			redirectUrl: "/submissions/s1",
		});
		expect(await p.approve(order, "stub")).toEqual({ ok: true });
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/unit/payments/factory.test.ts` → FAIL

- [ ] **Step 3: stub-provider.ts**

Create `src/lib/payments/stub-provider.ts`:

```ts
import type {
	ApproveResult,
	PaymentOrderRow,
	PaymentProvider,
	ReadyContext,
	ReadyResult,
} from "@/lib/payments/types";

// 무료 파일럿: 외부 결제창 없이 주문을 바로 통과시킨다. payReady 가 이어서 approveOrder 를
// 호출해 paid_at 스탬프 + release 까지 수행 → 기존 즉시 스탬프 동작과 동치.
export class StubPaymentProvider implements PaymentProvider {
	async ready(order: PaymentOrderRow, _ctx: ReadyContext): Promise<ReadyResult> {
		return {
			ok: true,
			tid: `stub_${order.id}`,
			redirectUrl: `/submissions/${order.submissionId}`,
		};
	}
	async approve(
		_order: PaymentOrderRow,
		_pgToken: string,
	): Promise<ApproveResult> {
		return { ok: true };
	}
}
```

- [ ] **Step 4: factory.ts**

Create `src/lib/payments/factory.ts`:

```ts
import { env } from "@/lib/env";
import { KakaoPayProvider } from "@/lib/payments/kakaopay-provider";
import { StubPaymentProvider } from "@/lib/payments/stub-provider";
import type { PaymentProvider } from "@/lib/payments/types";

// 실결제(카카오페이) 활성 조건: 플래그 on + secret key 존재.
export function isKakaoPayEnabled(): boolean {
	return env.FEATURE_PAYMENT_ENABLED === "true" && Boolean(env.KAKAO_PAY_SECRET_KEY);
}

export function createPaymentProvider(): PaymentProvider {
	return isKakaoPayEnabled()
		? new KakaoPayProvider()
		: new StubPaymentProvider();
}
```

> `KakaoPayProvider` 는 Task 6 에서 생성. 이 시점엔 import 가 미해결이라 factory 테스트는 Task 6 후 통과. (먼저 stub-provider 만으로 진행하려면 Task 6 와 함께 본다.)

- [ ] **Step 5: (Task 6 후) 통과 + commit** — Task 6 Step 6 에서 함께 커밋.

---

## Task 6: KakaoPay provider (TDD, fetch 모킹)

**Files:** `src/lib/payments/kakaopay-provider.ts`, `tests/unit/payments/kakaopay-provider.test.ts`

> ⚠️ **카카오페이 API 검증 필수**: ready/approve 엔드포인트·인증 헤더·테스트 CID 는 카카오페이 공식
> 문서(현행 Open API)로 **반드시 확정**할 것. 아래 코드는 현행 Open API 형태(`open-api.kakaopay.com`,
> `Authorization: SECRET_KEY {key}`, 테스트 CID `TC0ONETIME`) 기준이며, 다르면 이 파일 내에서만 조정.
> 테스트는 `fetch` 를 모킹하므로 엔드포인트 차이와 무관하게 로직을 검증한다.

- [ ] **Step 1: 실패 테스트**

Create `tests/unit/payments/kakaopay-provider.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: {
		FEATURE_PAYMENT_ENABLED: "true",
		KAKAO_PAY_SECRET_KEY: "TESTSECRET",
		KAKAO_PAY_CID: "TC0ONETIME",
		NEXT_PUBLIC_APP_URL: "http://localhost:3000",
	},
}));

import { KakaoPayProvider } from "@/lib/payments/kakaopay-provider";

const order = {
	id: "o1",
	submissionId: "s1",
	userId: "u1",
	amount: 9900,
	provider: "kakaopay" as const,
	providerTid: null as string | null,
	status: "ready" as const,
};
const ctx = {
	itemName: "연기 평가",
	partnerUserId: "u1",
	approvalUrl: "http://localhost:3000/api/payments/kakao/approve?order=o1",
	cancelUrl: "http://localhost:3000/submissions?payment=canceled",
	failUrl: "http://localhost:3000/submissions?payment=failed",
};

afterEach(() => vi.restoreAllMocks());

describe("KakaoPayProvider.ready", () => {
	it("성공 → tid + redirectUrl", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					tid: "T1234",
					next_redirect_pc_url: "https://kakaopay/redirect",
				}),
				{ status: 200 },
			),
		);
		const r = await new KakaoPayProvider().ready(order, ctx);
		expect(r).toEqual({
			ok: true,
			tid: "T1234",
			redirectUrl: "https://kakaopay/redirect",
		});
	});

	it("HTTP 오류 → ok:false", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("bad", { status: 400 }),
		);
		const r = await new KakaoPayProvider().ready(order, ctx);
		expect(r.ok).toBe(false);
	});
});

describe("KakaoPayProvider.approve", () => {
	it("성공 → ok:true", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ aid: "A1" }), { status: 200 }),
		);
		const r = await new KakaoPayProvider().approve(
			{ ...order, providerTid: "T1234" },
			"pgtok",
		);
		expect(r).toEqual({ ok: true });
	});

	it("HTTP 오류 → ok:false", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("err", { status: 400 }),
		);
		const r = await new KakaoPayProvider().approve(
			{ ...order, providerTid: "T1234" },
			"pgtok",
		);
		expect(r.ok).toBe(false);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/unit/payments/kakaopay-provider.test.ts` → FAIL

- [ ] **Step 3: kakaopay-provider.ts**

Create `src/lib/payments/kakaopay-provider.ts`:

```ts
import { env } from "@/lib/env";
import type {
	ApproveResult,
	PaymentOrderRow,
	PaymentProvider,
	ReadyContext,
	ReadyResult,
} from "@/lib/payments/types";

// ⚠️ 현행 카카오페이 Open API 기준 — 구현 시 공식 문서로 엔드포인트/인증/CID 재확인.
const BASE = "https://open-api.kakaopay.com/online/v1/payment";

function authHeaders(): HeadersInit {
	return {
		Authorization: `SECRET_KEY ${env.KAKAO_PAY_SECRET_KEY ?? ""}`,
		"Content-Type": "application/json",
	};
}
const CID = () => env.KAKAO_PAY_CID ?? "TC0ONETIME";

export class KakaoPayProvider implements PaymentProvider {
	async ready(order: PaymentOrderRow, ctx: ReadyContext): Promise<ReadyResult> {
		try {
			const res = await fetch(`${BASE}/ready`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					cid: CID(),
					partner_order_id: order.id,
					partner_user_id: ctx.partnerUserId,
					item_name: ctx.itemName,
					quantity: 1,
					total_amount: order.amount,
					tax_free_amount: 0,
					approval_url: ctx.approvalUrl,
					cancel_url: ctx.cancelUrl,
					fail_url: ctx.failUrl,
				}),
			});
			if (!res.ok) return { ok: false, error: `ready_http_${res.status}` };
			const data = (await res.json()) as {
				tid?: string;
				next_redirect_pc_url?: string;
			};
			if (!data.tid || !data.next_redirect_pc_url)
				return { ok: false, error: "ready_bad_response" };
			return {
				ok: true,
				tid: data.tid,
				redirectUrl: data.next_redirect_pc_url,
			};
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : "ready_failed",
			};
		}
	}

	async approve(
		order: PaymentOrderRow,
		pgToken: string,
	): Promise<ApproveResult> {
		if (!order.providerTid) return { ok: false, error: "missing_tid" };
		try {
			const res = await fetch(`${BASE}/approve`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					cid: CID(),
					tid: order.providerTid,
					partner_order_id: order.id,
					partner_user_id: order.userId,
					pg_token: pgToken,
				}),
			});
			if (!res.ok) return { ok: false, error: `approve_http_${res.status}` };
			return { ok: true };
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : "approve_failed",
			};
		}
	}
}
```

- [ ] **Step 4: 통과 확인**

Run: `bun run test:ci tests/unit/payments/kakaopay-provider.test.ts` → PASS (4)

- [ ] **Step 5: factory 테스트도 통과 확인**

Run: `bun run test:ci tests/unit/payments/factory.test.ts` → PASS (2)

- [ ] **Step 6: lint + commit (factory 포함)**

Run: `bun run lint` → PASS
```bash
git add src/lib/payments/kakaopay-provider.ts src/lib/payments/factory.ts tests/unit/payments/kakaopay-provider.test.ts tests/unit/payments/factory.test.ts
git commit -m "feat(payment): KakaoPay provider + factory"
```

---

## Task 7: 결제 actions (payReady / approveOrder)

**Files:** `src/lib/payments/actions.ts`, `tests/integration/payments/actions.test.ts`

- [ ] **Step 1: actions.ts 작성**

Create `src/lib/payments/actions.ts`:

```ts
"use server";

import { and, eq, isNull } from "drizzle-orm";
import { requireConsumer } from "@/lib/auth/require-consumer";
import { db } from "@/lib/db/client";
import { paymentOrders, submissions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { SUBMISSION_PRICE_KRW } from "@/lib/payments/config";
import { createPaymentProvider, isKakaoPayEnabled } from "@/lib/payments/factory";
import { releaseSubmission } from "@/lib/submissions/release-action";

export type PayReadyResult =
	| { ok: true; redirectUrl: string }
	| { ok: false; error: "not_found" | "ready_failed" };

// 결제 시작: 주문 생성 + provider.ready. stub 모드면 곧바로 approveOrder 까지 수행.
export async function payReady(submissionId: string): Promise<PayReadyResult> {
	const user = await requireConsumer();

	// 본인·미결제·soft-delete 제외 (release 게이트의 scored 여부는 release 가 검증).
	const submission = await db.query.submissions.findFirst({
		where: and(
			eq(submissions.id, submissionId),
			eq(submissions.uploaderUserId, user.appUser.id),
			isNull(submissions.softDeletedAt),
		),
		columns: { id: true },
	});
	if (!submission) return { ok: false, error: "not_found" };

	const provider = isKakaoPayEnabled() ? "kakaopay" : "stub";
	const inserted = await db
		.insert(paymentOrders)
		.values({
			submissionId,
			userId: user.appUser.id,
			amount: SUBMISSION_PRICE_KRW,
			provider,
		})
		.returning();
	const order = inserted[0];

	const appUrl = env.NEXT_PUBLIC_APP_URL;
	const ready = await createPaymentProvider().ready(
		{
			id: order.id,
			submissionId: order.submissionId,
			userId: order.userId,
			amount: order.amount,
			provider: order.provider,
			providerTid: order.providerTid,
			status: order.status,
		},
		{
			itemName: "연기 평가 결과 공개",
			partnerUserId: user.appUser.id,
			approvalUrl: `${appUrl}/api/payments/kakao/approve?order=${order.id}`,
			cancelUrl: `${appUrl}/submissions/${submissionId}?payment=canceled`,
			failUrl: `${appUrl}/submissions/${submissionId}?payment=failed`,
		},
	);
	if (!ready.ok) {
		await db
			.update(paymentOrders)
			.set({ status: "failed" })
			.where(eq(paymentOrders.id, order.id));
		return { ok: false, error: "ready_failed" };
	}

	await db
		.update(paymentOrders)
		.set({ providerTid: ready.tid })
		.where(eq(paymentOrders.id, order.id));

	// stub: 외부 결제창 없이 즉시 승인까지(무료 파일럿).
	if (provider === "stub") {
		await approveOrder(order.id, "stub");
	}

	return { ok: true, redirectUrl: ready.redirectUrl };
}

// 승인 처리(콜백/스텁 공용). 멱등. 성공 시 paid_at 스탬프 + release.
export async function approveOrder(
	orderId: string,
	pgToken: string,
): Promise<{ ok: boolean; submissionId?: string }> {
	const order = await db.query.paymentOrders.findFirst({
		where: eq(paymentOrders.id, orderId),
	});
	if (!order) return { ok: false };

	// 멱등: 이미 승인된 주문이면 재호출 무시(스탬프/release 는 이미 수행).
	if (order.status === "approved") {
		return { ok: true, submissionId: order.submissionId };
	}

	const res = await createPaymentProvider().approve(
		{
			id: order.id,
			submissionId: order.submissionId,
			userId: order.userId,
			amount: order.amount,
			provider: order.provider,
			providerTid: order.providerTid,
			status: order.status,
		},
		pgToken,
	);
	if (!res.ok) {
		await db
			.update(paymentOrders)
			.set({ status: "failed" })
			.where(eq(paymentOrders.id, orderId));
		return { ok: false };
	}

	await db
		.update(paymentOrders)
		.set({ status: "approved", approvedAt: new Date() })
		.where(eq(paymentOrders.id, orderId));

	// paid_at 스탬프(미결제일 때만 — 멱등) 후 release.
	await db
		.update(submissions)
		.set({ paidAt: new Date(), updatedAt: new Date() })
		.where(
			and(eq(submissions.id, order.submissionId), isNull(submissions.paidAt)),
		);
	await releaseSubmission(order.submissionId);

	return { ok: true, submissionId: order.submissionId };
}
```

- [ ] **Step 2: DB-gated 통합 테스트**

Create `tests/integration/payments/actions.test.ts`:

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
// requireConsumer + getCurrentUser 를 시드한 소비자로 대체.
// (approveOrder → releaseSubmission 이 getCurrentUser 로 소유자 인가를 하므로 둘 다 필요.)
let currentConsumerId = "";
vi.mock("@/lib/auth/require-consumer", () => ({
	requireConsumer: async () => ({ appUser: { id: currentConsumerId } }),
}));
vi.mock("@/lib/auth/current-user", () => ({
	getCurrentUser: async () => ({
		appUser: { id: currentConsumerId, role: "consumer" },
	}),
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("payment actions (stub mode, DB)", () => {
	let seed: typeof import("../_seed");
	let mod: typeof import("@/lib/payments/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		mod = await import("@/lib/payments/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("stub payReady → 주문 approved + paid_at 스탬프 + scored→released", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		currentConsumerId = consumer.id;
		const evaluator = await seed.seedUser(scope, "evaluator", {
			evaluatorActive: true,
		});
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "scored",
		});
		// primary 라벨(release 가 is_primary 셋 가능하도록) — 배정+라벨 시드.
		await seed.seedAssignment(submissionId, evaluator.id, false, "submitted");
		await seed.seedLabel(submissionId, evaluator.id, {});

		const r = await mod.payReady(submissionId);
		expect(r.ok).toBe(true);

		const order = await seed.pg`
			SELECT status, amount FROM payment_orders WHERE submission_id = ${submissionId}`;
		expect(order[0].status).toBe("approved");
		expect(order[0].amount).toBe(9900);

		const sub = await seed.pg`
			SELECT status, paid_at FROM submissions WHERE id = ${submissionId}`;
		expect(sub[0].paid_at).not.toBeNull();
		expect(sub[0].status).toBe("released");
	});

	it("approveOrder 멱등 — 두 번째 호출은 no-op ok", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		currentConsumerId = consumer.id;
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "scored",
		});
		const r = await mod.payReady(submissionId);
		expect(r.ok).toBe(true);
		const order = await seed.pg`
			SELECT id FROM payment_orders WHERE submission_id = ${submissionId}`;
		const again = await mod.approveOrder(order[0].id, "stub");
		expect(again.ok).toBe(true);
	});
});
```

> 주: 2번째 테스트는 라벨이 없어 release 가 not_scored/no primary 라벨이어도 결제 자체(approved+paid_at)는
> 성공해야 하며 멱등만 확인한다. release 의 세부 결과는 1번째 테스트가 검증.

- [ ] **Step 3: 통과 확인 (dev DB, 직렬)**

Run: `set -a; . ./.env.local; set +a; ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration/payments/actions.test.ts --no-file-parallelism`
Expected: PASS (2). guard off → SKIPPED. DB 불가 시 보고.

- [ ] **Step 4: typecheck + lint + commit**

Run: `bun run typecheck && bun run lint` → PASS
```bash
git add src/lib/payments/actions.ts tests/integration/payments/actions.test.ts
git commit -m "feat(payment): payReady + approveOrder (stamp paid_at + release)"
```

---

## Task 8: 승인 콜백 라우트

**Files:** `src/app/api/payments/kakao/approve/route.ts`, `tests/unit/api/payments/kakao-approve.test.ts`

- [ ] **Step 1: 실패 테스트**

Create `tests/unit/api/payments/kakao-approve.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));
const approveOrder = vi.fn();
vi.mock("@/lib/payments/actions", () => ({
	approveOrder: (...a: unknown[]) => approveOrder(...a),
}));

import { GET } from "@/app/api/payments/kakao/approve/route";

const req = (qs: string) =>
	new Request(`http://localhost/api/payments/kakao/approve${qs}`);

describe("GET /api/payments/kakao/approve", () => {
	it("order+pg_token 없으면 실패 리다이렉트", async () => {
		const res = await GET(req("?order=o1"));
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("payment=failed");
	});

	it("승인 성공 → 결과 페이지로 리다이렉트", async () => {
		approveOrder.mockResolvedValue({ ok: true, submissionId: "s1" });
		const res = await GET(req("?order=o1&pg_token=tok"));
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("/submissions/s1");
	});

	it("승인 실패 → 실패 리다이렉트", async () => {
		approveOrder.mockResolvedValue({ ok: false });
		const res = await GET(req("?order=o1&pg_token=tok"));
		expect(res.headers.get("location")).toContain("payment=failed");
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/unit/api/payments/kakao-approve.test.ts` → FAIL

- [ ] **Step 3: route.ts**

Create `src/app/api/payments/kakao/approve/route.ts`:

```ts
import { env } from "@/lib/env";
import { approveOrder } from "@/lib/payments/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 카카오페이 결제 승인 콜백(approval_url). 같은 브라우저 세션 리다이렉트라 소비자 쿠키 유지됨.
export async function GET(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const orderId = url.searchParams.get("order");
	const pgToken = url.searchParams.get("pg_token");
	const base = env.NEXT_PUBLIC_APP_URL;

	if (!orderId || !pgToken) {
		return Response.redirect(`${base}/submissions?payment=failed`, 307);
	}
	const r = await approveOrder(orderId, pgToken);
	const dest = r.ok
		? `${base}/submissions/${r.submissionId}`
		: `${base}/submissions?payment=failed`;
	return Response.redirect(dest, 307);
}
```

- [ ] **Step 4: 통과 + commit**

Run: `bun run test:ci tests/unit/api/payments/kakao-approve.test.ts` → PASS (3)
```bash
git add src/app/api/payments/kakao/approve/route.ts tests/unit/api/payments/kakao-approve.test.ts
git commit -m "feat(payment): KakaoPay approve callback route"
```

---

## Task 9: PayButton 리다이렉트 흐름

**Files:** `src/app/(consumer)/submissions/[id]/pay-button.tsx`

- [ ] **Step 1: pay-button.tsx 교체**

`src/app/(consumer)/submissions/[id]/pay-button.tsx` 를 아래로 교체(`payForSubmission` → `payReady` 리다이렉트):

```tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { payReady } from "@/lib/payments/actions";

// 결제하기 버튼. payReady 가 반환한 redirectUrl 로 이동:
//  - 카카오페이: 결제창 URL → 승인 후 콜백이 결과 공개
//  - stub(무료 파일럿): 이미 승인·release 된 결과 페이지 URL
export function PayButton({ submissionId }: { submissionId: string }) {
	const [pending, setPending] = useState(false);

	const onPay = async () => {
		setPending(true);
		const res = await payReady(submissionId);
		if (res.ok) {
			window.location.href = res.redirectUrl;
			return;
		}
		setPending(false);
		toast.error("결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
	};

	return (
		<Button onClick={onPay} disabled={pending}>
			{pending ? "처리 중…" : "결제하고 결과 보기"}
		</Button>
	);
}
```

- [ ] **Step 2: typecheck + lint**

Run: `bun run typecheck && bun run lint` → PASS

- [ ] **Step 3: 기존 payForSubmission 참조 확인**

Run: `grep -rn "payForSubmission" src/`
Expected: 이제 `payment-action.ts` 정의부만 남음(UI 참조 제거됨). payment-action.ts 는 그대로 둔다(무료 파일럿 레거시 경로 — 삭제하지 않음).

- [ ] **Step 4: commit**

```bash
git add "src/app/(consumer)/submissions/[id]/pay-button.tsx"
git commit -m "feat(payment): wire PayButton to KakaoPay redirect flow"
```

---

## Task 10: 전체 검증 + work-log + 배포 체크리스트

**Files:** `work-log/2026-06-05 소비자 결제 카카오페이 구현.md`

- [ ] **Step 1: 전체 게이트**

Run: `bun run typecheck && bun run lint && bun run test:ci 2>&1 | tail -6`
Expected: typecheck/lint PASS; 단위 전부 PASS, DB-gated skip.

- [ ] **Step 2: DB-gated 직렬 검증 (dev DB)**

Run: `set -a; . ./.env.local; set +a; RLS_TEST_DB=1 ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration --no-file-parallelism 2>&1 | tail -6`
Expected: 전부 PASS(결제 통합 2 포함). DB 불가 시 보고.

- [ ] **Step 3: 프로덕션 빌드**

Run: `bun run build 2>&1 | grep -E "Compiled|payments/kakao/approve|error|Error|failed" | head`
Expected: Compiled successfully, `/api/payments/kakao/approve` 라우트 등장.

- [ ] **Step 4: work-log 작성**

Create `work-log/2026-06-05 소비자 결제 카카오페이 구현.md` — 만든 것/검증/배포 체크리스트:
- Vercel env(Prod+Preview): `FEATURE_PAYMENT_ENABLED=true`, `KAKAO_PAY_SECRET_KEY`, `KAKAO_PAY_CID`
  (실거래는 가맹계약 후 운영 CID/키. 그 전엔 미설정 → stub 무료 파일럿 유지).
- prod DB 0020·0021 적용.
- ⚠️ **실거래 go-live 선행(코드 밖)**: 사업자 등록 + 카카오페이 온라인 가맹계약 + PIPA 자문.
  계약 전엔 sandbox(`TC0ONETIME`)로만 검증.
- ⚠️ 카카오페이 ready/approve 엔드포인트·인증·CID 는 공식 문서로 확정(provider 캡슐화).
- 후속: 환불(`cancel()`), 평가자 정산(원장→송금, 3.3% 원천징수).
- DB-gated 테스트는 `--no-file-parallelism` 직렬.

- [ ] **Step 5: commit (work-log)**

```bash
git add "work-log/2026-06-05 소비자 결제 카카오페이 구현.md"
git commit -m "docs(work-log): 2026-06-05 소비자 결제 카카오페이 구현"
```

---

## Self-Review (작성자 점검 완료)

- **Spec coverage:** §4 플로우(Task 7 actions + Task 8 콜백 + Task 9 버튼), §5 DB(Task 2·3), §6 추상화(Task 4·5·6), §7 env(Task 1 + Task 4 config), §8 보안/멱등(Task 7 본인검증·금액 서버결정·approve 멱등), §9 테스트(각 태스크), §10 사이드이펙트(flag off→stub 보존, build). 환불·정산은 비범위(인터페이스 cancel 주석). 누락 없음.
- **Placeholder scan:** 없음. KakaoPay HTTP는 "문서 검증" 플래그가 붙되 코드 자체는 완전(현행 Open API 형태). 테스트가 fetch 모킹이라 엔드포인트 차이와 독립.
- **Type consistency:** `PaymentProvider`/`PaymentOrderRow`/`ReadyResult`/`ApproveResult`/`ReadyContext` types.ts(Task 4)에 정의→provider/factory/actions 일치. `payReady`/`approveOrder`/`createPaymentProvider`/`isKakaoPayEnabled` Task 6↔7↔8↔9 일치. 테이블/컬럼 0020↔schema.ts↔쿼리 일치. `SUBMISSION_PRICE_KRW` Task4↔7 일치.
- **주의 플래그:** (1) 카카오페이 API 문서 검증(Task 6). (2) psql 부재 → 마이그레이션은 컨트롤러가 postgres-js 로 적용(Task 2·3). (3) 콜백 라우트는 소비자 세션 쿠키(SameSite=Lax, 동일도메인 리다이렉트) 가정 — approveOrder 가 releaseSubmission(세션 authz) 호출. (4) DB-gated 테스트 `--no-file-parallelism`.
