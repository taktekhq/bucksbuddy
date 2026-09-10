import { describe, it, expect, beforeEach } from "vitest";
import { loadCache, saveCache, clearCache } from "@/lib/cache";
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
    rate_used: 1,
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
  homeCurrency: "EUR",
  currencies: [{ code: "USD", rate: 1.08 }],
  safeGoldEntries: [gold()],
};

describe("cache", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is cached", () => {
    expect(loadCache("u1")).toBeNull();
  });

  it("round-trips a snapshot", () => {
    saveCache("u1", snapshot);
    expect(loadCache("u1")).toEqual(snapshot);
  });

  it("scopes the cache per user", () => {
    saveCache("u1", snapshot);
    expect(loadCache("u2")).toBeNull();
  });

  it("clears a cached snapshot", () => {
    saveCache("u1", snapshot);
    clearCache("u1");
    expect(loadCache("u1")).toBeNull();
  });

  it("ignores a snapshot written under an older version", () => {
    // v1 carried a single `lbpPerUsd` instead of the currency settings.
    localStorage.setItem(
      "bb-cache:u1",
      JSON.stringify({
        v: 1,
        transactions: [tx()],
        lbpPerUsd: 90000,
        safeGoldEntries: [],
      }),
    );
    expect(loadCache("u1")).toBeNull();
  });

  it("ignores a corrupt snapshot rather than throwing", () => {
    localStorage.setItem("bb-cache:u1", "{not json");
    expect(loadCache("u1")).toBeNull();
  });

  it("defaults missing gold entries to an empty list", () => {
    localStorage.setItem(
      "bb-cache:u1",
      JSON.stringify({
        v: 2,
        transactions: [tx()],
        homeCurrency: "USD",
        currencies: [],
      }),
    );
    expect(loadCache("u1")?.safeGoldEntries).toEqual([]);
  });
});
