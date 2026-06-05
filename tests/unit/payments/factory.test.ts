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
