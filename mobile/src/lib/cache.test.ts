// Ported from the web's src/lib/cache.test.ts. Same expectations, with
// AsyncStorage in place of localStorage (so every call is awaited).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearCache, loadCache, saveCache } from "@/lib/cache";
import type { CacheSnapshot } from "@/lib/cache";
import type { SafeGoldEntry, Transaction } from "@/types/db";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1000,
    original_currency: "USD",
    original_amount: 10,
    rate_used: 89500,
    occurred_at: "2026-01-01T00:00:00.000Z",
    note: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function gold(overrides: Partial<SafeGoldEntry> = {}): SafeGoldEntry {
  return {
    id: "g1",
    user_id: "u1",
    is_deposit: true,
    grams: 5,
    note: null,
    occurred_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const snapshot: CacheSnapshot = {
  transactions: [tx()],
  lbpPerUsd: 90000,
  safeGoldEntries: [gold()],
};

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const removeItem = AsyncStorage.removeItem as jest.Mock;

describe("cache", () => {
  it("returns null when nothing is cached", async () => {
    await expect(loadCache("u1")).resolves.toBeNull();
  });

  it("round-trips a snapshot", async () => {
    await saveCache("u1", snapshot);
    await expect(loadCache("u1")).resolves.toEqual(snapshot);
  });

  it("scopes the cache per user", async () => {
    await saveCache("u1", snapshot);
    expect(setItem).toHaveBeenCalledWith("bb-cache:u1", expect.any(String));
    await expect(loadCache("u2")).resolves.toBeNull();
  });

  it("clears a cached snapshot", async () => {
    await saveCache("u1", snapshot);
    await clearCache("u1");
    await expect(loadCache("u1")).resolves.toBeNull();
  });

  it("ignores a snapshot written under an older version", async () => {
    await AsyncStorage.setItem("bb-cache:u1", JSON.stringify({ v: 0, ...snapshot }));
    await expect(loadCache("u1")).resolves.toBeNull();
  });

  it("ignores a snapshot whose transactions aren't a list", async () => {
    await AsyncStorage.setItem(
      "bb-cache:u1",
      JSON.stringify({ v: 1, transactions: "nope", lbpPerUsd: 90000 }),
    );
    await expect(loadCache("u1")).resolves.toBeNull();
  });

  it("ignores a corrupt snapshot rather than throwing", async () => {
    await AsyncStorage.setItem("bb-cache:u1", "{not json");
    await expect(loadCache("u1")).resolves.toBeNull();
  });

  it("defaults missing gold entries to an empty list", async () => {
    await AsyncStorage.setItem(
      "bb-cache:u1",
      JSON.stringify({ v: 1, transactions: [tx()], lbpPerUsd: 90000 }),
    );
    await expect(loadCache("u1")).resolves.toEqual({
      transactions: [tx()],
      lbpPerUsd: 90000,
      safeGoldEntries: [],
    });
  });

  it("treats an unreadable store as an empty cache", async () => {
    getItem.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(loadCache("u1")).resolves.toBeNull();
  });

  it("swallows a failed write — the cache is only a nicety", async () => {
    setItem.mockRejectedValueOnce(new Error("storage full"));
    await expect(saveCache("u1", snapshot)).resolves.toBeUndefined();
  });

  it("swallows a failed clear", async () => {
    removeItem.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(clearCache("u1")).resolves.toBeUndefined();
  });
});
