import { describe, expect, it, vi } from "vitest";

// Mock env so t3-env validation doesn't throw when Supabase vars are absent.
// The describe.skipIf guard below prevents the test body from running in that case.
vi.mock("@/lib/env", () => ({
	env: {
		NEXT_PUBLIC_SUPABASE_URL:
			process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
		NEXT_PUBLIC_SUPABASE_ANON_KEY:
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-placeholder",
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
		SUPABASE_SERVICE_ROLE_KEY:
			process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-role-placeholder",
	},
}));

import { createServiceRoleClient } from "@/lib/supabase/service-role";

const skip =
	!process.env.SUPABASE_SERVICE_ROLE_KEY ||
	!process.env.NEXT_PUBLIC_SUPABASE_URL;

describe.skipIf(skip)("get_parent_feedback RPC", () => {
	it("returns empty for invalid token", async () => {
		const supabase = createServiceRoleClient();
		const { data, error } = await supabase.rpc("get_parent_feedback", {
			p_token: "definitely-not-a-real-token",
		});
		expect(error).toBeNull();
		expect(data ?? []).toHaveLength(0);
	});
});
