# Notifications (Foundation + Web Push + PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채널 불문 알림 공통토대 + 웹 푸시 채널 + PWA 설치형을 구현하고, 3개 이벤트(결과 공개/새 배정/채점 완료)에 알림을 연결한다. 알림톡은 인터페이스 stub만.

**Architecture:** server action commit 후 `notifications` 아웃박스에 enqueue → `after()`로 응답 후 즉시 dispatch 시도 → 실패/누락은 daily cron(`/api/cron/dispatch-notifications`)이 재시도. dispatch는 `createNotificationChannel(channel)`로 채널 어댑터(WebPush 실구현, AlimTalk stub)를 골라 발송. 웹 푸시는 service worker + VAPID + `push_subscriptions` 구독.

**Tech Stack:** Next.js 16 App Router, Drizzle/postgres-js, `web-push`(신규, 승인됨), VAPID, Service Worker / Web Push API, t3-env, Vitest, Vercel Cron.

---

## File Structure

- **Create** `src/lib/notifications/types.ts` — 타입·인터페이스(`NotificationChannel`, `SendResult`, enums)
- **Create** `src/lib/notifications/copy.ts` — `buildNotificationContent()` (P2-safe 문구, 점수/등급 없음)
- **Create** `src/lib/notifications/web-push-channel.ts` — `WebPushChannel`
- **Create** `src/lib/notifications/alimtalk-channel.ts` — `AlimTalkChannel` stub
- **Create** `src/lib/notifications/factory.ts` — `createNotificationChannel()`
- **Create** `src/lib/notifications/actions.ts` — `enqueueNotification`/`dispatchNotification`/`drainPendingNotifications`/`savePushSubscription`/`notify`
- **Create** `src/app/api/cron/dispatch-notifications/route.ts` — cron drain route
- **Create** `public/sw.js` — service worker (push / notificationclick)
- **Create** `src/components/notifications/push-opt-in.tsx` — 권한 요청 + 구독 UI
- **Create** `src/components/pwa/install-prompt.tsx` — PWA 설치 프롬프트
- **Create** `migrations/0018_notifications.sql`, `migrations/0019_notifications_rls.sql`
- **Modify** `src/lib/db/schema.ts` — `pushSubscriptions`, `notifications` 테이블 정의
- **Modify** `src/lib/env.ts` — VAPID/FEATURE_WEB_PUSH/알림톡 env
- **Modify** `vercel.json` — cron 추가
- **Modify** `public/site.webmanifest` — `start_url`/`id` 보강
- **Modify** `src/lib/submissions/release-action.ts`, `src/lib/assignment/score-action.ts`, `src/lib/assignment/actions.ts` — 이벤트 훅
- **Tests** — 각 태스크에 명시

---

## Task 1: web-push 의존성 추가

**Files:** `package.json`

- [ ] **Step 1: 의존성 설치**

Run: `bun add web-push && bun add -d @types/web-push`
Expected: `package.json` `dependencies`에 `web-push`, `devDependencies`에 `@types/web-push` 추가.

- [ ] **Step 2: 설치 확인**

Run: `bun pm ls | grep web-push`
Expected: `web-push@...` 출력.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "build(notifications): add web-push dependency"
```

---

## Task 2: env 추가 (VAPID / FEATURE_WEB_PUSH / 알림톡 stub)

**Files:** `src/lib/env.ts`

- [ ] **Step 1: server 스키마에 추가**

`src/lib/env.ts`의 server 객체에서 `CRON_SECRET: z.string().min(1),` 줄 바로 다음에 추가:

```ts
		CRON_SECRET: z.string().min(1),
		// 웹 푸시 (D-②). FEATURE_WEB_PUSH=true 일 때만 실제 필요 → optional + 런타임 체크.
		FEATURE_WEB_PUSH: z.enum(["true", "false"]).default("false"),
		VAPID_PUBLIC_KEY: z.string().optional(),
		VAPID_PRIVATE_KEY: z.string().optional(),
		VAPID_SUBJECT: z.string().optional(),
		// 카카오 알림톡 (후속 — 현재 stub). 미설정 OK.
		KAKAO_ALIMTALK_API_KEY: z.string().optional(),
		KAKAO_ALIMTALK_SENDER_KEY: z.string().optional(),
```

- [ ] **Step 2: client 스키마에 추가**

`client` 객체의 `NEXT_PUBLIC_APP_URL: z.string().url(),` 다음에 추가:

```ts
		NEXT_PUBLIC_APP_URL: z.string().url(),
		// 클라이언트 푸시 구독용 VAPID 공개키 (FEATURE_WEB_PUSH 시 필요).
		NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
```

- [ ] **Step 3: runtimeEnv 매핑 추가**

`runtimeEnv` 객체의 `CRON_SECRET: process.env.CRON_SECRET,` 다음에 추가:

```ts
		CRON_SECRET: process.env.CRON_SECRET,
		FEATURE_WEB_PUSH: process.env.FEATURE_WEB_PUSH,
		VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
		VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
		VAPID_SUBJECT: process.env.VAPID_SUBJECT,
		KAKAO_ALIMTALK_API_KEY: process.env.KAKAO_ALIMTALK_API_KEY,
		KAKAO_ALIMTALK_SENDER_KEY: process.env.KAKAO_ALIMTALK_SENDER_KEY,
		NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
```

- [ ] **Step 4: typecheck + Commit**

Run: `bun run typecheck`
Expected: PASS

```bash
git add src/lib/env.ts
git commit -m "feat(notifications): add web push + alimtalk env vars"
```

---

## Task 3: DB 마이그레이션 0018 + schema.ts 테이블

**Files:** `migrations/0018_notifications.sql`, `src/lib/db/schema.ts`

- [ ] **Step 1: 마이그레이션 작성**

Create `migrations/0018_notifications.sql`:

```sql
-- 0018_notifications.sql
-- 적용 시점: 0017 이후. D-② 알림 (공통토대 + 웹푸시).
-- Source: docs/superpowers/specs/2026-06-05-notifications-webpush-pwa-design.md
-- push_subscriptions: 사용자 웹푸시 구독. notifications: 발송 아웃박스.
-- 관례: 0014 따름 (uuid PK default gen_random_uuid(), timestamptz default now(),
--   inline CHECK enum, named constraint, idx_*).

BEGIN;

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('submission_released','evaluator_assigned','submission_scored')),
  channel text NOT NULL CHECK (channel IN ('web_push','alimtalk')),
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX idx_notifications_status ON notifications(status);

COMMIT;
```

- [ ] **Step 2: schema.ts에 테이블 추가**

`src/lib/db/schema.ts`의 `labeledResults` 테이블 정의 끝(닫는 `);`) 다음, relations 블록 앞에 추가. 파일 상단 import에 `check`, `index`, `unique`, `integer`, `text`, `timestamp`, `uuid`가 이미 있으니 그대로 사용:

```ts
// ─── push_subscriptions (웹푸시 구독 — 0018) ───────────────────────
export const pushSubscriptions = pgTable(
	"push_subscriptions",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		endpoint: text("endpoint").notNull(),
		p256dh: text("p256dh").notNull(),
		auth: text("auth").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("push_subscriptions_endpoint_unique").on(t.endpoint),
		index("idx_push_subscriptions_user").on(t.userId),
	],
);

// ─── notifications (발송 아웃박스 — 0018) ──────────────────────────
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: text("type")
			.$type<
				"submission_released" | "evaluator_assigned" | "submission_scored"
			>()
			.notNull(),
		channel: text("channel").$type<"web_push" | "alimtalk">().notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		url: text("url").notNull(),
		status: text("status")
			.$type<"pending" | "sent" | "failed">()
			.notNull()
			.default("pending"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		sentAt: timestamp("sent_at", { withTimezone: true }),
	},
	(t) => [
		check(
			"notifications_type_enum",
			sql`${t.type} IN ('submission_released','evaluator_assigned','submission_scored')`,
		),
		check(
			"notifications_channel_enum",
			sql`${t.channel} IN ('web_push','alimtalk')`,
		),
		check(
			"notifications_status_enum",
			sql`${t.status} IN ('pending','sent','failed')`,
		),
		index("idx_notifications_status").on(t.status),
	],
);
```

- [ ] **Step 3: typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: dev DB에 마이그레이션 적용**

Run: `set -a; . ./.env.local; set +a; psql "$DATABASE_URL" -f migrations/0018_notifications.sql`
Expected: `BEGIN`/`CREATE TABLE`/`CREATE INDEX`/`COMMIT` 출력, 에러 없음.
> dev DB 접속 불가 시 이 스텝 보류하고 보고. typecheck(Step 3)는 필수.

- [ ] **Step 5: Commit**

```bash
git add migrations/0018_notifications.sql src/lib/db/schema.ts
git commit -m "feat(notifications): 0018 push_subscriptions + notifications tables"
```

---

## Task 4: DB 마이그레이션 0019 (RLS)

**Files:** `migrations/0019_notifications_rls.sql`

- [ ] **Step 1: RLS 마이그레이션 작성**

Create `migrations/0019_notifications_rls.sql`:

```sql
-- 0019_notifications_rls.sql
-- 적용 시점: 0018 이후. 알림 테이블 RLS.
-- push_subscriptions: 본인 구독만 관리(authenticated). 발송 조회는 service-role(RLS bypass).
-- notifications: 시스템(service-role) 전용 — authenticated 정책 없음(=deny). in-app 센터는 비범위.

BEGIN;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_owner_select ON push_subscriptions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY push_subscriptions_owner_insert ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY push_subscriptions_owner_update ON push_subscriptions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY push_subscriptions_owner_delete ON push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

-- notifications: RLS 켜고 정책 없음 → authenticated 전면 차단. service-role 만 접근(시스템 write/send).
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

COMMIT;
```

- [ ] **Step 2: dev DB 적용**

Run: `set -a; . ./.env.local; set +a; psql "$DATABASE_URL" -f migrations/0019_notifications_rls.sql`
Expected: `COMMIT`, 에러 없음.
> dev DB 접속 불가 시 보류·보고.

- [ ] **Step 3: Commit**

```bash
git add migrations/0019_notifications_rls.sql
git commit -m "feat(notifications): 0019 RLS — owner-only subscriptions, system-only notifications"
```

---

## Task 5: 알림 문구 빌더 (copy.ts) — TDD

**Files:** `src/lib/notifications/types.ts`, `src/lib/notifications/copy.ts`, `tests/unit/notifications/copy.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/unit/notifications/copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildNotificationContent } from "@/lib/notifications/copy";

describe("buildNotificationContent", () => {
	it("submission_released → 소비자 결과 공개, /submissions/[id]", () => {
		const c = buildNotificationContent("submission_released", "abc");
		expect(c.url).toBe("/submissions/abc");
		expect(c.title).toBe("결과가 준비됐어요");
	});

	it("evaluator_assigned → /score/[id], 마감 안내", () => {
		const c = buildNotificationContent("evaluator_assigned", "xyz");
		expect(c.url).toBe("/score/xyz");
		expect(c.title).toBe("새 채점 배정");
	});

	it("submission_scored → /submissions/[id]", () => {
		const c = buildNotificationContent("submission_scored", "s1");
		expect(c.url).toBe("/submissions/s1");
	});

	it("P2: 어떤 문구에도 숫자(점수/등급)가 없다", () => {
		for (const type of [
			"submission_released",
			"evaluator_assigned",
			"submission_scored",
		] as const) {
			const c = buildNotificationContent(type, "id");
			// 마감 '48' 같은 숫자는 평가 점수가 아니므로 title+body 중 '점/등급' 류만 금지.
			// 점수/등급 노출 방지: A~D 단독 등급 토큰과 'N점' 패턴이 없어야 한다.
			expect(`${c.title} ${c.body}`).not.toMatch(/\b[A-D]\b|\d+\s*점/);
		}
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/unit/notifications/copy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: types.ts 작성**

Create `src/lib/notifications/types.ts`:

```ts
export type NotificationType =
	| "submission_released"
	| "evaluator_assigned"
	| "submission_scored";

export type NotificationChannelName = "web_push" | "alimtalk";

export type NotificationRow = {
	id: string;
	userId: string;
	type: NotificationType;
	channel: NotificationChannelName;
	title: string;
	body: string;
	url: string;
};

export type SendResult =
	| { ok: true }
	| { ok: false; error: string; retryable: boolean };

export interface NotificationChannel {
	send(n: NotificationRow): Promise<SendResult>;
}
```

- [ ] **Step 4: copy.ts 작성**

Create `src/lib/notifications/copy.ts`:

```ts
import type { NotificationType } from "@/lib/notifications/types";

export type NotificationContent = { title: string; body: string; url: string };

// P2 하드게이트: 점수/등급 등 평가 내용은 절대 포함하지 않는다.
export function buildNotificationContent(
	type: NotificationType,
	submissionId: string,
): NotificationContent {
	switch (type) {
		case "submission_released":
			return {
				title: "결과가 준비됐어요",
				body: "확인해 보세요",
				url: `/submissions/${submissionId}`,
			};
		case "submission_scored":
			return {
				title: "채점이 끝났어요",
				body: "결제 후 결과가 공개됩니다",
				url: `/submissions/${submissionId}`,
			};
		case "evaluator_assigned":
			return {
				title: "새 채점 배정",
				body: "48시간 내에 채점해 주세요",
				url: `/score/${submissionId}`,
			};
	}
}
```

- [ ] **Step 5: 통과 확인 + Commit**

Run: `bun run test:ci tests/unit/notifications/copy.test.ts`
Expected: PASS (4 tests)

```bash
git add src/lib/notifications/types.ts src/lib/notifications/copy.ts tests/unit/notifications/copy.test.ts
git commit -m "feat(notifications): types + P2-safe copy builder"
```

---

## Task 6: 채널 factory + AlimTalk stub — TDD

**Files:** `src/lib/notifications/alimtalk-channel.ts`, `src/lib/notifications/factory.ts`, `tests/unit/notifications/factory.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/unit/notifications/factory.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// web-push-channel imports the db client (postgres). Mock env so import is safe.
vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: "postgresql://localhost:5432/test",
		VAPID_SUBJECT: "mailto:test@example.com",
		VAPID_PUBLIC_KEY: "",
		VAPID_PRIVATE_KEY: "",
	},
}));

import { vi } from "vitest";
import { AlimTalkChannel } from "@/lib/notifications/alimtalk-channel";
import { createNotificationChannel } from "@/lib/notifications/factory";
import { WebPushChannel } from "@/lib/notifications/web-push-channel";

describe("createNotificationChannel", () => {
	it("web_push → WebPushChannel", () => {
		expect(createNotificationChannel("web_push")).toBeInstanceOf(WebPushChannel);
	});
	it("alimtalk → AlimTalkChannel", () => {
		expect(createNotificationChannel("alimtalk")).toBeInstanceOf(AlimTalkChannel);
	});
});

describe("AlimTalkChannel (stub)", () => {
	it("항상 not_configured, retryable=false", async () => {
		const r = await new AlimTalkChannel().send({
			id: "1",
			userId: "u",
			type: "submission_released",
			channel: "alimtalk",
			title: "t",
			body: "b",
			url: "/x",
		});
		expect(r).toEqual({
			ok: false,
			error: "alimtalk_not_configured",
			retryable: false,
		});
	});
});
```

> 주의: `vi.mock`은 호이스팅되므로 `import { vi }`보다 위에 둬도 동작하지만, 위 파일은 명시적으로 `vi`를 별도 import 한다. Vitest는 `vi.mock`을 파일 최상단으로 호이스팅한다.

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/unit/notifications/factory.test.ts`
Expected: FAIL — modules not found (factory/alimtalk/web-push-channel 미존재).

- [ ] **Step 3: alimtalk-channel.ts 작성**

Create `src/lib/notifications/alimtalk-channel.ts`:

```ts
import type {
	NotificationChannel,
	NotificationRow,
	SendResult,
} from "@/lib/notifications/types";

// 후속 사이클 stub — 카카오 비즈채널·대행사·템플릿 심사 완료 전까지 미발송.
export class AlimTalkChannel implements NotificationChannel {
	async send(_n: NotificationRow): Promise<SendResult> {
		return { ok: false, error: "alimtalk_not_configured", retryable: false };
	}
}
```

- [ ] **Step 4: factory.ts 작성**

Create `src/lib/notifications/factory.ts`:

```ts
import { AlimTalkChannel } from "@/lib/notifications/alimtalk-channel";
import type {
	NotificationChannel,
	NotificationChannelName,
} from "@/lib/notifications/types";
import { WebPushChannel } from "@/lib/notifications/web-push-channel";

export function createNotificationChannel(
	channel: NotificationChannelName,
): NotificationChannel {
	switch (channel) {
		case "web_push":
			return new WebPushChannel();
		case "alimtalk":
			return new AlimTalkChannel();
	}
}
```

> 이 시점엔 `web-push-channel.ts`가 없어 테스트가 여전히 실패한다. Task 7에서 생성한다. 다만 factory/alimtalk만 먼저 커밋하지 말고 Task 7까지 한 흐름으로 본다.

- [ ] **Step 5: (Task 7 완료 후) 통과 확인 + Commit**

Task 7에서 `web-push-channel.ts` 생성 후:
Run: `bun run test:ci tests/unit/notifications/factory.test.ts`
Expected: PASS (3 tests)

```bash
git add src/lib/notifications/alimtalk-channel.ts src/lib/notifications/factory.ts tests/unit/notifications/factory.test.ts
git commit -m "feat(notifications): channel factory + alimtalk stub"
```

---

## Task 7: WebPushChannel — TDD (DB-gated 통합)

**Files:** `src/lib/notifications/web-push-channel.ts`, `tests/integration/notifications/web-push-channel.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/integration/notifications/web-push-channel.test.ts`:

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
		VAPID_SUBJECT: "mailto:test@example.com",
		VAPID_PUBLIC_KEY: "BPUBLICTESTKEY",
		VAPID_PRIVATE_KEY: "PRIVATETESTKEY",
	},
}));

// web-push 네트워크 호출을 모킹.
const sendNotification = vi.fn();
vi.mock("web-push", () => ({
	default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) },
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("WebPushChannel", () => {
	let seed: typeof import("../_seed");
	let WebPushChannel: typeof import("@/lib/notifications/web-push-channel").WebPushChannel;
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		({ WebPushChannel } = await import("@/lib/notifications/web-push-channel"));
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	const row = (userId: string) => ({
		id: "n1",
		userId,
		type: "submission_released" as const,
		channel: "web_push" as const,
		title: "t",
		body: "b",
		url: "/submissions/x",
	});

	it("구독 있으면 발송 → ok:true", async () => {
		sendNotification.mockReset().mockResolvedValue({});
		const u = await seed.seedUser(scope, "consumer");
		await seed.pg`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
			VALUES (${u.id}, ${"https://push/ep1"}, ${"p"}, ${"a"})`;
		const r = await new WebPushChannel().send(row(u.id));
		expect(r.ok).toBe(true);
		expect(sendNotification).toHaveBeenCalledTimes(1);
	});

	it("구독 없으면 ok:false no_subscription", async () => {
		sendNotification.mockReset();
		const u = await seed.seedUser(scope, "consumer");
		const r = await new WebPushChannel().send(row(u.id));
		expect(r).toMatchObject({ ok: false, error: "no_subscription" });
	});

	it("410 → 죽은 구독 삭제", async () => {
		sendNotification.mockReset().mockRejectedValue({ statusCode: 410 });
		const u = await seed.seedUser(scope, "consumer");
		await seed.pg`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
			VALUES (${u.id}, ${"https://push/dead"}, ${"p"}, ${"a"})`;
		await new WebPushChannel().send(row(u.id));
		const rows = await seed.pg`SELECT 1 FROM push_subscriptions WHERE endpoint = ${"https://push/dead"}`;
		expect(rows.length).toBe(0);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/integration/notifications/web-push-channel.test.ts`
Expected: SKIPPED (가드 off) — 단, 모듈 미존재로 import 단계에서 실패할 수 있음. 모듈 생성 후 재확인.

- [ ] **Step 3: web-push-channel.ts 작성**

Create `src/lib/notifications/web-push-channel.ts`:

```ts
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type {
	NotificationChannel,
	NotificationRow,
	SendResult,
} from "@/lib/notifications/types";

export class WebPushChannel implements NotificationChannel {
	constructor() {
		webpush.setVapidDetails(
			env.VAPID_SUBJECT ?? "mailto:admin@directorsnote.app",
			env.VAPID_PUBLIC_KEY ?? "",
			env.VAPID_PRIVATE_KEY ?? "",
		);
	}

	async send(n: NotificationRow): Promise<SendResult> {
		const subs = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, n.userId));
		if (subs.length === 0)
			return { ok: false, error: "no_subscription", retryable: false };

		const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url });
		let anyOk = false;
		let lastErr = "";
		for (const s of subs) {
			try {
				await webpush.sendNotification(
					{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
					payload,
				);
				anyOk = true;
			} catch (e) {
				const statusCode = (e as { statusCode?: number }).statusCode;
				if (statusCode === 404 || statusCode === 410) {
					// 죽은 구독 — 삭제(재시도 무의미).
					await db
						.delete(pushSubscriptions)
						.where(eq(pushSubscriptions.id, s.id));
				} else {
					lastErr = e instanceof Error ? e.message : "send_failed";
				}
			}
		}
		if (anyOk) return { ok: true };
		return {
			ok: false,
			error: lastErr || "all_subscriptions_dead",
			retryable: lastErr !== "",
		};
	}
}
```

- [ ] **Step 4: 통과 확인 (가드 ON, dev DB)**

Run: `set -a; . ./.env.local; set +a; ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration/notifications/web-push-channel.test.ts`
Expected: PASS (3 tests). dev DB 불가 시 보류·보고하되 가드 OFF skip은 확인.

- [ ] **Step 5: Commit (factory 테스트와 함께)**

Task 6 Step 5의 factory 테스트도 이제 통과한다. 함께 확인:
Run: `bun run test:ci tests/unit/notifications/factory.test.ts`
Expected: PASS

```bash
git add src/lib/notifications/web-push-channel.ts tests/integration/notifications/web-push-channel.test.ts
git commit -m "feat(notifications): WebPushChannel — send + dead-subscription cleanup"
```

---

## Task 8: actions.ts (enqueue / dispatch / drain / savePushSubscription / notify)

**Files:** `src/lib/notifications/actions.ts`, `tests/unit/notifications/enqueue-flag.test.ts`, `tests/integration/notifications/actions.test.ts`

- [ ] **Step 1: enqueue flag-skip 단위 테스트 작성**

Create `tests/unit/notifications/enqueue-flag.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

// FEATURE_WEB_PUSH off → web_push enqueue 는 DB 안 건드리고 null 반환.
vi.mock("@/lib/env", () => ({
	env: { FEATURE_WEB_PUSH: "false", DATABASE_URL: "postgresql://localhost:5432/x" },
}));

import { enqueueNotification } from "@/lib/notifications/actions";

describe("enqueueNotification — FEATURE_WEB_PUSH off", () => {
	it("web_push 채널은 flag off 면 null (행 미생성)", async () => {
		const id = await enqueueNotification({
			userId: "u",
			type: "submission_released",
			submissionId: "s",
		});
		expect(id).toBeNull();
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/unit/notifications/enqueue-flag.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: actions.ts 작성**

Create `src/lib/notifications/actions.ts`:

```ts
"use server";

import { and, eq, lt, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { notifications, pushSubscriptions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { buildNotificationContent } from "@/lib/notifications/copy";
import { createNotificationChannel } from "@/lib/notifications/factory";
import type {
	NotificationChannelName,
	NotificationType,
} from "@/lib/notifications/types";

const MAX_ATTEMPTS = 5;

export type EnqueueInput = {
	userId: string;
	type: NotificationType;
	submissionId: string;
	channel?: NotificationChannelName;
};

// 아웃박스에 알림 1건 기록. FEATURE_WEB_PUSH off 면 web_push 는 skip(null).
export async function enqueueNotification(
	input: EnqueueInput,
): Promise<string | null> {
	const channel = input.channel ?? "web_push";
	if (channel === "web_push" && env.FEATURE_WEB_PUSH !== "true") return null;
	const content = buildNotificationContent(input.type, input.submissionId);
	const rows = await db
		.insert(notifications)
		.values({
			userId: input.userId,
			type: input.type,
			channel,
			title: content.title,
			body: content.body,
			url: content.url,
		})
		.returning({ id: notifications.id });
	return rows[0]?.id ?? null;
}

// 단건 발송 시도. 이미 sent 면 멱등 skip. 반환: 발송 성공 여부.
export async function dispatchNotification(id: string): Promise<boolean> {
	const row = await db.query.notifications.findFirst({
		where: eq(notifications.id, id),
	});
	if (!row || row.status === "sent") return false;

	const channel = createNotificationChannel(row.channel);
	const result = await channel.send({
		id: row.id,
		userId: row.userId,
		type: row.type,
		channel: row.channel,
		title: row.title,
		body: row.body,
		url: row.url,
	});

	if (result.ok) {
		await db
			.update(notifications)
			.set({ status: "sent", sentAt: new Date() })
			.where(eq(notifications.id, id));
		return true;
	}
	await db
		.update(notifications)
		.set({
			status: "failed",
			attempts: sql`${notifications.attempts} + 1`,
			lastError: result.error,
		})
		.where(eq(notifications.id, id));
	return false;
}

// cron 재시도: pending + (failed && attempts<MAX) 를 순회 발송.
export async function drainPendingNotifications(): Promise<{
	processed: number;
	sent: number;
}> {
	const rows = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			or(
				eq(notifications.status, "pending"),
				and(
					eq(notifications.status, "failed"),
					lt(notifications.attempts, MAX_ATTEMPTS),
				),
			),
		);
	let sent = 0;
	for (const r of rows) {
		if (await dispatchNotification(r.id)) sent += 1;
	}
	return { processed: rows.length, sent };
}

// 액션 훅에서 호출. enqueue + 응답 후 즉시 발송 시도. 실패해도 호출 액션을 깨지 않음.
export async function notify(input: EnqueueInput): Promise<void> {
	try {
		const id = await enqueueNotification(input);
		if (id) after(() => dispatchNotification(id).catch(() => {}));
	} catch (e) {
		console.error("[notify] enqueue failed", e);
	}
}

// 클라이언트 푸시 구독 저장(본인). endpoint 충돌 시 갱신.
export async function savePushSubscription(sub: {
	endpoint: string;
	p256dh: string;
	auth: string;
}): Promise<{ ok: boolean }> {
	const user = await getCurrentUser();
	if (!user) return { ok: false };
	await db
		.insert(pushSubscriptions)
		.values({
			userId: user.appUser.id,
			endpoint: sub.endpoint,
			p256dh: sub.p256dh,
			auth: sub.auth,
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { userId: user.appUser.id, p256dh: sub.p256dh, auth: sub.auth },
		});
	return { ok: true };
}
```

> `getCurrentUser()`의 반환에서 앱 사용자 id는 `user.appUser.id`다(release-action.ts와 동일). 확인 후 사용.

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `bun run test:ci tests/unit/notifications/enqueue-flag.test.ts`
Expected: PASS

- [ ] **Step 5: DB-gated 통합 테스트 작성**

Create `tests/integration/notifications/actions.test.ts`:

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
		FEATURE_WEB_PUSH: "true",
		VAPID_SUBJECT: "mailto:test@example.com",
		VAPID_PUBLIC_KEY: "BPUB",
		VAPID_PRIVATE_KEY: "PRIV",
	},
}));
const sendNotification = vi.fn();
vi.mock("web-push", () => ({
	default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) },
}));

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("notifications actions (DB)", () => {
	let seed: typeof import("../_seed");
	let mod: typeof import("@/lib/notifications/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		mod = await import("@/lib/notifications/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("enqueue → pending 행 생성, dispatch(구독있음) → sent 전이", async () => {
		sendNotification.mockReset().mockResolvedValue({});
		const u = await seed.seedUser(scope, "consumer");
		await seed.pg`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
			VALUES (${u.id}, ${"https://push/ep-act"}, ${"p"}, ${"a"})`;
		const id = await mod.enqueueNotification({
			userId: u.id,
			type: "submission_released",
			submissionId: "sub-1",
		});
		expect(id).toBeTruthy();
		const before = await seed.pg`SELECT status FROM notifications WHERE id = ${id}`;
		expect(before[0].status).toBe("pending");

		const ok = await mod.dispatchNotification(id as string);
		expect(ok).toBe(true);
		const after = await seed.pg`SELECT status, sent_at FROM notifications WHERE id = ${id}`;
		expect(after[0].status).toBe("sent");
		expect(after[0].sent_at).not.toBeNull();

		// 멱등: 다시 dispatch 해도 재발송 안 함.
		sendNotification.mockClear();
		const again = await mod.dispatchNotification(id as string);
		expect(again).toBe(false);
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it("dispatch 실패 → failed + attempts 증가, drain 이 재시도", async () => {
		sendNotification.mockReset().mockRejectedValue({ statusCode: 500 });
		const u = await seed.seedUser(scope, "consumer");
		await seed.pg`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
			VALUES (${u.id}, ${"https://push/ep-fail"}, ${"p"}, ${"a"})`;
		const id = (await mod.enqueueNotification({
			userId: u.id,
			type: "submission_scored",
			submissionId: "sub-2",
		})) as string;
		await mod.dispatchNotification(id);
		const f = await seed.pg`SELECT status, attempts FROM notifications WHERE id = ${id}`;
		expect(f[0].status).toBe("failed");
		expect(f[0].attempts).toBe(1);

		// drain 은 failed(attempts<5) 를 다시 시도(여전히 실패) → attempts 누적.
		await mod.drainPendingNotifications();
		const f2 = await seed.pg`SELECT attempts FROM notifications WHERE id = ${id}`;
		expect(f2[0].attempts).toBeGreaterThanOrEqual(2);
	});
});
```

- [ ] **Step 6: 통과 확인 (dev DB)**

Run: `set -a; . ./.env.local; set +a; ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration/notifications/actions.test.ts`
Expected: PASS (2 tests). dev DB 불가 시 보류·보고.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notifications/actions.ts tests/unit/notifications/enqueue-flag.test.ts tests/integration/notifications/actions.test.ts
git commit -m "feat(notifications): enqueue/dispatch/drain/savePushSubscription + notify"
```

---

## Task 9: cron drain route + vercel.json

**Files:** `src/app/api/cron/dispatch-notifications/route.ts`, `vercel.json`, `tests/unit/api/cron/dispatch-notifications.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/unit/api/cron/dispatch-notifications.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-secret" } }));

const drainPendingNotifications = vi.fn();
vi.mock("@/lib/notifications/actions", () => ({
	drainPendingNotifications: () => drainPendingNotifications(),
}));

import { GET } from "@/app/api/cron/dispatch-notifications/route";

const reqWith = (auth?: string) =>
	new Request("http://localhost/api/cron/dispatch-notifications", {
		headers: auth ? { authorization: auth } : {},
	});

describe("GET /api/cron/dispatch-notifications", () => {
	beforeEach(() => {
		drainPendingNotifications.mockReset().mockResolvedValue({ processed: 0, sent: 0 });
	});

	it("헤더 없음 → 401, drain 미호출", async () => {
		const res = await reqWith();
		const r = await GET(res);
		expect(r.status).toBe(401);
		expect(drainPendingNotifications).not.toHaveBeenCalled();
	});

	it("올바른 토큰 → 200 + 결과", async () => {
		drainPendingNotifications.mockResolvedValue({ processed: 3, sent: 2 });
		const r = await GET(reqWith("Bearer test-secret"));
		expect(r.status).toBe(200);
		expect(await r.json()).toEqual({ ok: true, processed: 3, sent: 2 });
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `bun run test:ci tests/unit/api/cron/dispatch-notifications.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: route 작성**

Create `src/app/api/cron/dispatch-notifications/route.ts`:

```ts
import { env } from "@/lib/env";
import { drainPendingNotifications } from "@/lib/notifications/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
	// Vercel Cron 이 Authorization: Bearer ${CRON_SECRET} 자동 첨부 (D-① 와 동일).
	if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const result = await drainPendingNotifications();
	console.info("[cron/dispatch-notifications] ok", result);
	return Response.json({ ok: true, ...result });
}
```

- [ ] **Step 4: vercel.json에 cron 추가**

`vercel.json`의 `crons` 배열에 항목 추가 (전체를 아래로 교체):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["icn1"],
  "crons": [
    { "path": "/api/cron/sweep-assignments", "schedule": "0 18 * * *" },
    { "path": "/api/cron/dispatch-notifications", "schedule": "30 * * * *" }
  ]
}
```

> `30 * * * *` = 매시 30분. **주의: Hobby 플랜은 daily cron만 허용**한다. Hobby 라면 이 스케줄은 거부되므로, Hobby 환경에서는 `"0 19 * * *"`(daily, KST 04:00)로 두고 즉시-`after()` 발송에 의존한다(cron 은 안전망). 실행자는 현재 Vercel 플랜을 확인해 Hobby면 daily 로 설정하고 그 사실을 보고할 것.

- [ ] **Step 5: 통과 + JSON 유효성 + Commit**

Run: `bun run test:ci tests/unit/api/cron/dispatch-notifications.test.ts`
Expected: PASS (2 tests)
Run: `bun -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid')"`
Expected: `valid`

```bash
git add src/app/api/cron/dispatch-notifications/route.ts vercel.json tests/unit/api/cron/dispatch-notifications.test.ts
git commit -m "feat(notifications): cron drain route + schedule"
```

---

## Task 10: 이벤트 훅 연결 (release / score / assign)

**Files:** `src/lib/submissions/release-action.ts`, `src/lib/assignment/score-action.ts`, `src/lib/assignment/actions.ts`, `tests/integration/notifications/event-hooks.test.ts`

- [ ] **Step 1: release-action.ts 훅 추가**

`src/lib/submissions/release-action.ts` 상단 import에 추가:

```ts
import { notify } from "@/lib/notifications/actions";
```

`releaseSubmission`의 try/catch 블록 다음, `return { ok: true, alreadyReleased: false };` 바로 앞에 추가:

```ts
	// 결과 공개 → uploader(소비자) 알림. enqueue 실패는 release 를 깨지 않음.
	await notify({
		userId: submission.uploaderUserId,
		type: "submission_released",
		submissionId,
	});

	return { ok: true, alreadyReleased: false };
```

- [ ] **Step 2: score-action.ts 훅 추가**

`src/lib/assignment/score-action.ts` 상단 import에 추가:

```ts
import { notify } from "@/lib/notifications/actions";
```

`submitEvaluatorScore`의 try/catch 블록 다음, `return { ok: true, redirectTo: "/queue", derivedGrade };` 바로 앞에 추가:

```ts
	// primary 채점 완료 → submissions 가 scored 로 전이. uploader 에게 알림.
	if (isPrimary) {
		const sub = await db.query.submissions.findFirst({
			where: eq(submissions.id, submissionId),
			columns: { uploaderUserId: true },
		});
		if (sub) {
			await notify({
				userId: sub.uploaderUserId,
				type: "submission_scored",
				submissionId,
			});
		}
	}

	return { ok: true, redirectTo: "/queue", derivedGrade };
```

- [ ] **Step 3: assignment/actions.ts 훅 추가**

`src/lib/assignment/actions.ts` 상단 import에 추가:

```ts
import { notify } from "@/lib/notifications/actions";
```

`assignSubmission` 안에서 primary claim 성공 직후에 알림. 현재 코드:

```ts
			const claimed = await tryClaimPrimary(
				db,
				submissionId,
				evaluatorId,
				dueAt,
			);
			if (!claimed) continue; // 다음 후보 재시도.
```

를 다음으로 교체(claim 성공 직후 평가자 알림 추가):

```ts
			const claimed = await tryClaimPrimary(
				db,
				submissionId,
				evaluatorId,
				dueAt,
			);
			if (!claimed) continue; // 다음 후보 재시도.

			// primary 배정 확정 → 평가자에게 알림(redundant 라벨은 알림 없음).
			await notify({
				userId: evaluatorId,
				type: "evaluator_assigned",
				submissionId,
			});
```

- [ ] **Step 4: typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: DB-gated 통합 테스트 작성**

Create `tests/integration/notifications/event-hooks.test.ts`:

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
		FEATURE_WEB_PUSH: "true",
		FEATURE_PAYMENT_ENABLED: "false",
		VAPID_SUBJECT: "mailto:test@example.com",
		VAPID_PUBLIC_KEY: "BPUB",
		VAPID_PRIVATE_KEY: "PRIV",
	},
}));
// after() 즉시발송이 web-push 를 호출하지만 결과는 본 테스트와 무관 → 모킹.
vi.mock("web-push", () => ({
	default: { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue({}) },
}));
// after() 콜백은 테스트 환경에서 실행되지 않아도 enqueue 행은 생성된다.

const skip = !process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

describe.skipIf(skip)("event hooks → notifications enqueue", () => {
	let seed: typeof import("../_seed");
	let assign: typeof import("@/lib/assignment/actions");
	let scope: ReturnType<typeof import("../_seed").newScope>;

	beforeAll(async () => {
		seed = await import("../_seed");
		assign = await import("@/lib/assignment/actions");
		scope = seed.newScope();
	});
	afterAll(async () => {
		await seed.cleanupScope(scope);
	});

	it("assignSubmission(primary) → evaluator 에게 evaluator_assigned 행", async () => {
		const consumer = await seed.seedUser(scope, "consumer");
		const e1 = await seed.seedUser(scope, "evaluator", { evaluatorActive: true });
		const submissionId = await seed.seedSubmission(scope, consumer.id, {
			status: "queued",
		});
		// rng 높게 → redundant 없음(primary 격리).
		await assign.assignSubmission(submissionId, () => 0.99);

		const rows = await seed.pg`
			SELECT type, user_id FROM notifications
			WHERE submission_id IS NULL AND user_id = ${e1.id} AND type = 'evaluator_assigned'`;
		// submission_id 컬럼은 없으므로 user_id+type 로만 조회.
		const byUser = await seed.pg`
			SELECT type FROM notifications WHERE user_id = ${e1.id} AND type = 'evaluator_assigned'`;
		expect(byUser.length).toBe(1);
	});
});
```

> 위 테스트는 `notifications` 테이블에 `submission_id` 컬럼이 없으므로 `user_id + type` 으로만 조회한다(첫 쿼리는 무시; `byUser` 가 실제 단언). 실행자는 첫 더미 쿼리를 제거하고 `byUser` 단언만 남겨도 된다.

- [ ] **Step 6: 통과 확인 (dev DB)**

Run: `set -a; . ./.env.local; set +a; ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration/notifications/event-hooks.test.ts`
Expected: PASS. dev DB 불가 시 보류·보고.
> 회귀 확인: `set -a; . ./.env.local; set +a; RLS_TEST_DB=1 ASSIGNMENT_TEST_DB=1 bun run test:ci tests/integration/assignment` 로 기존 배정/채점 통합테스트가 여전히 PASS 인지 확인(훅 추가로 깨지지 않았는지).

- [ ] **Step 7: Commit**

```bash
git add src/lib/submissions/release-action.ts src/lib/assignment/score-action.ts src/lib/assignment/actions.ts tests/integration/notifications/event-hooks.test.ts
git commit -m "feat(notifications): wire release/score/assign event hooks"
```

---

## Task 11: 서비스워커 (public/sw.js)

**Files:** `public/sw.js`

> 서비스워커는 브라우저 런타임 코드라 단위 테스트 대상이 아니다(수동/E2E 검증). 코드를 정확히 제공한다.

- [ ] **Step 1: sw.js 작성**

Create `public/sw.js`:

```js
// Director's Note 웹푸시 서비스워커.
// push 이벤트 → 알림 표시. notificationclick → 해당 URL 열기.
self.addEventListener("push", (event) => {
	if (!event.data) return;
	let data;
	try {
		data = event.data.json();
	} catch {
		return;
	}
	event.waitUntil(
		self.registration.showNotification(data.title || "알림", {
			body: data.body || "",
			data: { url: data.url || "/" },
			icon: "/android-chrome-192x192.png",
			badge: "/favicon-32x32.png",
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || "/";
	event.waitUntil(
		clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((wins) => {
				for (const w of wins) {
					if (w.url.includes(url) && "focus" in w) return w.focus();
				}
				return clients.openWindow(url);
			}),
	);
});
```

- [ ] **Step 2: 정적 서빙 확인**

Run: `bun run build && ls .next 2>/dev/null; test -f public/sw.js && echo "sw.js present"`
Expected: `sw.js present`. (Next 는 `public/` 파일을 루트에서 그대로 서빙 → `/sw.js` 접근 가능, 루트 스코프 등록 가능.)

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(notifications): service worker for web push"
```

---

## Task 12: 푸시 권한 요청 UI (push-opt-in.tsx)

**Files:** `src/components/notifications/push-opt-in.tsx`

> 클라이언트 컴포넌트(브라우저 PushManager). 단위 테스트 비대상 — 코드 제공 + 수동 검증.

- [ ] **Step 1: 컴포넌트 작성**

Create `src/components/notifications/push-opt-in.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { savePushSubscription } from "@/lib/notifications/actions";
import { env } from "@/lib/env";

// VAPID base64url → Uint8Array (PushManager applicationServerKey 용).
function urlBase64ToUint8Array(base64: string): Uint8Array {
	const padding = "=".repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(b64);
	const arr = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
	return arr;
}

export function PushOptIn() {
	const [supported, setSupported] = useState(false);
	const [permission, setPermission] =
		useState<NotificationPermission>("default");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const ok =
			typeof window !== "undefined" &&
			"serviceWorker" in navigator &&
			"PushManager" in window &&
			"Notification" in window;
		setSupported(ok);
		if (ok) setPermission(Notification.permission);
	}, []);

	if (!supported || permission === "granted") return null;

	async function enable() {
		const vapid = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
		if (!vapid) return;
		setBusy(true);
		try {
			const perm = await Notification.requestPermission();
			setPermission(perm);
			if (perm !== "granted") return;
			const reg = await navigator.serviceWorker.register("/sw.js");
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapid),
			});
			const json = sub.toJSON();
			await savePushSubscription({
				endpoint: json.endpoint ?? "",
				p256dh: json.keys?.p256dh ?? "",
				auth: json.keys?.auth ?? "",
			});
		} finally {
			setBusy(false);
		}
	}

	return (
		<Button variant="outline" size="sm" onClick={enable} disabled={busy}>
			{busy ? "설정 중…" : "알림 켜기"}
		</Button>
	);
}
```

> `@/components/ui/button`의 `Button` export 확인(shadcn). 없으면 프로젝트의 동등 버튼 사용. `env`를 클라이언트에서 import 하려면 t3-env client 키여야 함 — `NEXT_PUBLIC_VAPID_PUBLIC_KEY`는 client 블록에 있으므로 OK.

- [ ] **Step 2: 소비자/평가자 진입점에 배치**

소비자 대시보드(`src/app/(consumer)/submissions/page.tsx` 등 로그인 후 첫 화면)와 평가자 큐(`src/app/(evaluator)/queue/page.tsx` 또는 해당 경로)에 `<PushOptIn />`를 헤더 근처에 렌더. 실행자는 실제 경로를 확인해 1곳씩 배치(없으면 가장 가까운 로그인-후 레이아웃에).

- [ ] **Step 3: typecheck + Commit**

Run: `bun run typecheck`
Expected: PASS

```bash
git add src/components/notifications/push-opt-in.tsx src/app
git commit -m "feat(notifications): push opt-in UI + placement"
```

---

## Task 13: PWA 설치 프롬프트 + manifest 보강

**Files:** `src/components/pwa/install-prompt.tsx`, `public/site.webmanifest`

- [ ] **Step 1: manifest 보강**

`public/site.webmanifest`를 아래로 교체(`start_url`/`id`/`scope` 추가, 기존 값 유지):

```json
{
	"name": "Director's Note",
	"short_name": "Director's Note",
	"id": "/",
	"start_url": "/",
	"scope": "/",
	"icons": [
		{ "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
		{ "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" }
	],
	"theme_color": "#ffffff",
	"background_color": "#ffffff",
	"display": "standalone"
}
```

- [ ] **Step 2: 설치 프롬프트 컴포넌트 작성**

Create `src/components/pwa/install-prompt.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
	const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
	const [isIos, setIsIos] = useState(false);
	const [standalone, setStandalone] = useState(false);

	useEffect(() => {
		const onBip = (e: Event) => {
			e.preventDefault();
			setDeferred(e as BeforeInstallPromptEvent);
		};
		window.addEventListener("beforeinstallprompt", onBip);
		const ua = window.navigator.userAgent.toLowerCase();
		setIsIos(/iphone|ipad|ipod/.test(ua));
		setStandalone(
			window.matchMedia("(display-mode: standalone)").matches ||
				// iOS Safari
				(window.navigator as unknown as { standalone?: boolean }).standalone === true,
		);
		return () => window.removeEventListener("beforeinstallprompt", onBip);
	}, []);

	if (standalone) return null;

	// Android/Chrome: beforeinstallprompt 사용.
	if (deferred) {
		return (
			<Button
				variant="outline"
				size="sm"
				onClick={async () => {
					await deferred.prompt();
					await deferred.userChoice;
					setDeferred(null);
				}}
			>
				앱 설치
			</Button>
		);
	}

	// iOS Safari: beforeinstallprompt 미지원 → 수동 안내.
	if (isIos) {
		return (
			<p className="text-xs text-muted-foreground">
				홈 화면에 추가: 공유 버튼 → "홈 화면에 추가"
			</p>
		);
	}

	return null;
}
```

- [ ] **Step 3: 배치 + typecheck**

Task 12의 `<PushOptIn />` 옆(동일 로그인-후 화면)에 `<InstallPrompt />` 배치.
Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/pwa/install-prompt.tsx public/site.webmanifest src/app
git commit -m "feat(pwa): install prompt + manifest start_url"
```

---

## Task 14: 전체 검증 + work-log + 배포 체크리스트

**Files:** `work-log/2026-06-05 알림 웹푸시 PWA 구현.md`

- [ ] **Step 1: 전체 게이트**

Run: `bun run typecheck && bun run lint && bun run test:ci 2>&1 | tail -6`
Expected: typecheck/lint PASS, 테스트 전부 PASS(신규 단위 포함) | DB-gated skip.

- [ ] **Step 2: 프로덕션 빌드 (로컬 .env.local 에 임시 VAPID 필요)**

먼저 VAPID 키 생성 후 `.env.local` 에 주입(이미 있으면 skip):
```bash
bunx web-push generate-vapid-keys
```
출력의 Public/Private 를 `.env.local` 에 추가:
```
FEATURE_WEB_PUSH=true
VAPID_PUBLIC_KEY=<public>
VAPID_PRIVATE_KEY=<private>
VAPID_SUBJECT=mailto:admin@directorsnote.app
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public>
```
Run: `bun run build 2>&1 | grep -E "Compiled|dispatch-notifications|error|Error|failed"`
Expected: `Compiled successfully`, `/api/cron/dispatch-notifications` 라우트 등장, 에러 없음.

- [ ] **Step 3: work-log 작성**

Create `work-log/2026-06-05 알림 웹푸시 PWA 구현.md` — 만든 것(공통토대/웹푸시/PWA), 검증 결과, 그리고 배포 체크리스트:
- Vercel env(Production+Preview): `FEATURE_WEB_PUSH=true`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 추가. prod 용 VAPID 키는 `bunx web-push generate-vapid-keys` 로 별도 생성 권장.
- dev/prod DB 에 0018·0019 적용 확인.
- **Vercel 플랜이 Hobby 면** `dispatch-notifications` cron 을 daily(`0 19 * * *`)로 — 분 단위 cron 거부됨. 즉시-`after()` 발송이 주 경로, cron 은 안전망.
- 배포 후: 소비자/평가자로 로그인 → "알림 켜기" → 권한 허용 → 테스트 이벤트(예: 평가자 배정) → 푸시 수신 확인. iOS 는 홈화면 설치 후 확인.

- [ ] **Step 4: Commit (work-log)**

```bash
git add "work-log/2026-06-05 알림 웹푸시 PWA 구현.md"
git commit -m "docs(work-log): 2026-06-05 알림 웹푸시 PWA 구현"
```

---

## Self-Review (작성자 점검 완료)

- **Spec coverage:** §4 아키텍처(Task 8 actions + Task 9 cron + Task 10 hooks), §5 DB(Task 3·4), §6 추상화(Task 5·6·7·8), §7 클라이언트(Task 11 SW·12 권한·13 PWA), §8 문구/훅(Task 5 copy·Task 10 hooks), §9 env/deps(Task 1·2), §10 에러/멱등(Task 8 dispatch dup-skip·notify 격리·flag-skip), §11 테스트(각 태스크 TDD/통합), §12 사이드이펙트(Task 10 회귀 확인 step). 누락 없음.
- **Placeholder scan:** 없음 — 모든 코드/명령 구체화. 컴포넌트 배치(Task 12·13 Step 2)는 실제 경로 확인을 요구하나 코드 자체는 완전.
- **Type consistency:** `NotificationType`/`NotificationChannelName`/`NotificationRow`/`SendResult` 가 types.ts(Task 5)에 정의되고 copy/factory/channels/actions/route 전반에서 동일 사용. `notify`/`enqueueNotification`/`dispatchNotification`/`drainPendingNotifications`/`savePushSubscription` 시그니처 Task 8↔9↔10 일치. `buildNotificationContent(type, submissionId)` Task 5↔8 일치. 테이블/컬럼명 0018↔schema.ts(Task 3)↔쿼리 일치.
- **주의 플래그:** (1) Hobby cron 제약 — Task 9·14 에 명시. (2) `getCurrentUser().appUser.id` 형태는 release-action.ts 기준 — 실행자가 확인. (3) `Button`/컴포넌트 경로는 실행자가 shadcn 실제 export 로 확인.
