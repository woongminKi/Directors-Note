import { describe, expect, it, vi } from "vitest";

// web-push-channel imports the db client + web-push. Mock both so import + construct are safe.
vi.mock("@/lib/env", () => ({
	env: {
		DATABASE_URL: "postgresql://localhost:5432/test",
		VAPID_SUBJECT: "mailto:test@example.com",
		VAPID_PUBLIC_KEY: "",
		VAPID_PRIVATE_KEY: "",
	},
}));
vi.mock("web-push", () => ({
	default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

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
