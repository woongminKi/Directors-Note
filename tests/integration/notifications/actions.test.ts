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
	default: {
		setVapidDetails: vi.fn(),
		sendNotification: (...a: unknown[]) => sendNotification(...a),
	},
}));

const skip =
	!process.env.DATABASE_URL || process.env.ASSIGNMENT_TEST_DB !== "1";

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

	it("enqueue → pending 행, dispatch(구독있음) → sent + 멱등", async () => {
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
		const before =
			await seed.pg`SELECT status FROM notifications WHERE id = ${id}`;
		expect(before[0].status).toBe("pending");

		const ok = await mod.dispatchNotification(id as string);
		expect(ok).toBe(true);
		const done =
			await seed.pg`SELECT status, sent_at FROM notifications WHERE id = ${id}`;
		expect(done[0].status).toBe("sent");
		expect(done[0].sent_at).not.toBeNull();

		sendNotification.mockClear();
		const again = await mod.dispatchNotification(id as string);
		expect(again).toBe(false);
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it("dispatch 실패 → failed + attempts++, drain 재시도", async () => {
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
		const f =
			await seed.pg`SELECT status, attempts FROM notifications WHERE id = ${id}`;
		expect(f[0].status).toBe("failed");
		expect(f[0].attempts).toBe(1);

		await mod.drainPendingNotifications();
		const f2 =
			await seed.pg`SELECT attempts FROM notifications WHERE id = ${id}`;
		expect(f2[0].attempts).toBeGreaterThanOrEqual(2);
	});
});
