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
		drainPendingNotifications
			.mockReset()
			.mockResolvedValue({ processed: 0, sent: 0 });
	});

	it("헤더 없음 → 401, drain 미호출", async () => {
		const r = await GET(reqWith());
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
