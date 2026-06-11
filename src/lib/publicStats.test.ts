import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { fetchPublicStats } from "@/lib/publicStats";

// What the public_stats() rpc returns (see migrations/0006_public_stats.sql).
const payload = () => ({
  users: 12,
  transactions: 3400,
  encrypted_users: 5,
  top_categories: [
    { category: "food", count: 120 },
    { category: "coffee", count: 80 },
  ],
});

describe("fetchPublicStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the rpc payload onto PublicStats", async () => {
    rpc.mockResolvedValue({ data: payload(), error: null });
    expect(await fetchPublicStats()).toEqual({
      users: 12,
      transactions: 3400,
      encryptedUsers: 5,
      topCategories: [
        { category: "food", count: 120 },
        { category: "coffee", count: 80 },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("public_stats");
  });

  it("returns null on an rpc error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await fetchPublicStats()).toBeNull();
  });

  it("returns null when the payload is missing or not an object", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchPublicStats()).toBeNull();
    rpc.mockResolvedValue({ data: 5, error: null });
    expect(await fetchPublicStats()).toBeNull();
  });

  it("rejects junk counts", async () => {
    rpc.mockResolvedValue({ data: { ...payload(), users: "carrots" }, error: null });
    expect(await fetchPublicStats()).toBeNull();
    rpc.mockResolvedValue({ data: { ...payload(), transactions: -1 }, error: null });
    expect(await fetchPublicStats()).toBeNull();
    const noEncrypted: Record<string, unknown> = payload();
    delete noEncrypted.encrypted_users;
    rpc.mockResolvedValue({ data: noEncrypted, error: null });
    expect(await fetchPublicStats()).toBeNull();
  });

  it("treats a missing category list as empty", async () => {
    rpc.mockResolvedValue({
      data: { ...payload(), top_categories: null },
      error: null,
    });
    expect(await fetchPublicStats()).toEqual({
      users: 12,
      transactions: 3400,
      encryptedUsers: 5,
      topCategories: [],
    });
  });

  it("rejects malformed category entries", async () => {
    rpc.mockResolvedValue({
      data: { ...payload(), top_categories: [null] },
      error: null,
    });
    expect(await fetchPublicStats()).toBeNull();
    rpc.mockResolvedValue({
      data: { ...payload(), top_categories: [{ category: 7, count: 1 }] },
      error: null,
    });
    expect(await fetchPublicStats()).toBeNull();
    rpc.mockResolvedValue({
      data: { ...payload(), top_categories: [{ category: "food", count: "x" }] },
      error: null,
    });
    expect(await fetchPublicStats()).toBeNull();
  });

  it("degrades silently when the rpc itself throws", async () => {
    rpc.mockRejectedValue(new Error("offline"));
    expect(await fetchPublicStats()).toBeNull();
  });
});
