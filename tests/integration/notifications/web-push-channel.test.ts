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

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
	default: {
		setVapidDetails: vi.fn(),
		sendNotification: (...a: unknown[]) => sendNotification(...a),
	},
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
