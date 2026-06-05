import { describe, expect, it, vi } from "vitest";

// FEATURE_WEB_PUSH off → web_push enqueue 는 DB 안 건드리고 null 반환.
vi.mock("@/lib/env", () => ({
	env: {
		FEATURE_WEB_PUSH: "false",
		DATABASE_URL: "postgresql://localhost:5432/x",
	},
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
