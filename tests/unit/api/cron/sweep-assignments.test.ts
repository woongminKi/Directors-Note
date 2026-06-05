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
