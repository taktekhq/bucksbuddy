import { describe, it, expect, beforeEach } from "vitest";
import { loadCache, saveCache, clearCache, parseCacheSnapshot, CACHE_KEY } from "./cache";
import type { CacheSnapshot } from "./cache";
import type { StoragePort } from "./storagePort";
import type { SafeGoldEntry, Transaction } from "./types";

// A minimal in-memory StoragePort, so this file exercises the real
// (async) interface store.tsx/cache.ts are written against — not
// jsdom's localStorage, which happens to be present under vitest but
// isn't what native's AsyncStorage-backed port actually looks like.
function memoryStorage(): StoragePort {
  const backing = new Map<string, string>();
  return {
    async get(key) {
      return backing.has(key) ? backing.get(key)! : null;
    },
    async set(key, value) {
      backing.set(key, value);
    },
    async remove(key) {
      backing.delete(key);
    },
  };
}

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

describe("parseCacheSnapshot", () => {
  it("returns null for a missing or corrupt raw value", () => {
    expect(parseCacheSnapshot(null)).toBeNull();
    expect(parseCacheSnapshot("{not json")).toBeNull();
  });

  it("parses a valid snapshot", () => {
    expect(parseCacheSnapshot(JSON.stringify({ v: 1, ...snapshot }))).toEqual(snapshot);
  });

  it("rejects a snapshot written under an older version", () => {
    expect(parseCacheSnapshot(JSON.stringify({ v: 0, ...snapshot }))).toBeNull();
  });

  it("defaults missing gold entries to an empty list", () => {
    const raw = JSON.stringify({ v: 1, transactions: [tx()], lbpPerUsd: 90000 });
    expect(parseCacheSnapshot(raw)?.safeGoldEntries).toEqual([]);
  });
});

describe("cache (storage-backed)", () => {
  let storage: StoragePort;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it("returns null when nothing is cached", async () => {
    expect(await loadCache(storage, "u1")).toBeNull();
  });

  it("round-trips a snapshot", async () => {
    await saveCache(storage, "u1", snapshot);
    expect(await loadCache(storage, "u1")).toEqual(snapshot);
  });

  it("scopes the cache per user", async () => {
    await saveCache(storage, "u1", snapshot);
    expect(await loadCache(storage, "u2")).toBeNull();
  });

  it("clears a cached snapshot", async () => {
    await saveCache(storage, "u1", snapshot);
    await clearCache(storage, "u1");
    expect(await loadCache(storage, "u1")).toBeNull();
  });

  it("keys storage per user under the documented format", async () => {
    await saveCache(storage, "u1", snapshot);
    expect(await storage.get(CACHE_KEY("u1"))).not.toBeNull();
  });
});
