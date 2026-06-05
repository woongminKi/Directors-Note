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
