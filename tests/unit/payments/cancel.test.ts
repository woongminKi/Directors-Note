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
import { StubPaymentProvider } from "@/lib/payments/stub-provider";

const order = {
	id: "o1",
	submissionId: "s1",
	userId: "u1",
	amount: 9900,
	provider: "kakaopay" as const,
	providerTid: "T1234" as string | null,
	status: "approved" as const,
};

afterEach(() => vi.restoreAllMocks());

describe("StubPaymentProvider.cancel", () => {
	it("ok:true", async () => {
		expect(await new StubPaymentProvider().cancel(order)).toEqual({ ok: true });
	});
});

describe("KakaoPayProvider.cancel", () => {
	it("성공 → ok:true", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ aid: "A1" }), { status: 200 }),
		);
		expect(await new KakaoPayProvider().cancel(order)).toEqual({ ok: true });
	});
	it("HTTP 오류 → ok:false", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("err", { status: 400 }),
		);
		const r = await new KakaoPayProvider().cancel(order);
		expect(r.ok).toBe(false);
	});
	it("providerTid 없음 → missing_tid", async () => {
		const r = await new KakaoPayProvider().cancel({ ...order, providerTid: null });
		expect(r).toEqual({ ok: false, error: "missing_tid" });
	});
});
