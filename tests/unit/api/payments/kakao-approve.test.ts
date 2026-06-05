import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
	env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));
const approveOrder = vi.fn();
vi.mock("@/lib/payments/actions", () => ({
	approveOrder: (...a: unknown[]) => approveOrder(...a),
}));

import { GET } from "@/app/api/payments/kakao/approve/route";

const req = (qs: string) =>
	new Request(`http://localhost/api/payments/kakao/approve${qs}`);

describe("GET /api/payments/kakao/approve", () => {
	it("order+pg_token 없으면 실패 리다이렉트", async () => {
		const res = await GET(req("?order=o1"));
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("payment=failed");
	});

	it("승인 성공 → 결과 페이지로 리다이렉트", async () => {
		approveOrder.mockResolvedValue({ ok: true, submissionId: "s1" });
		const res = await GET(req("?order=o1&pg_token=tok"));
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("/submissions/s1");
	});

	it("승인 실패 → 실패 리다이렉트", async () => {
		approveOrder.mockResolvedValue({ ok: false });
		const res = await GET(req("?order=o1&pg_token=tok"));
		expect(res.headers.get("location")).toContain("payment=failed");
	});
});
