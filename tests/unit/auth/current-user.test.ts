import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  db: { query: { users: { findFirst: vi.fn() } } },
}));

import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db/client";

describe("getCurrentUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no Supabase session", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when session exists but no users row", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1", email: "x@y" } }, error: null }) },
    });
    (db.query.users.findFirst as any).mockResolvedValue(undefined);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns shape { authUser, appUser, academyId, role } when both rows exist", async () => {
    (createClient as any).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1", email: "x@y" } }, error: null }) },
    });
    (db.query.users.findFirst as any).mockResolvedValue({
      id: "auth-1", academyId: "acad-1", role: "coach", email: "x@y",
    });
    const result = await getCurrentUser();
    expect(result).toEqual({
      authUser: { id: "auth-1", email: "x@y" },
      appUser: { id: "auth-1", academyId: "acad-1", role: "coach", email: "x@y" },
      academyId: "acad-1",
      role: "coach",
    });
  });
});
