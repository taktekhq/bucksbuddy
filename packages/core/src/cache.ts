// A per-user snapshot of the last loaded data, so the app can paint real
// numbers on the very first frame instead of zeros-then-pop. It never
// replaces the network read — it just fills the gap until the fresh data
// lands and overwrites it.
//
// Privacy: this holds *decrypted* amounts. That's the same trust boundary the
// app already lives by — passphrase-tier devices cache the passphrase here too
// (see e2e.ts) — so the snapshot is no more exposed than the key that unlocks
// it. It's only ever written while unlocked, and it's cleared on sign-out,
// account deletion, and whenever a device turns out to be locked.
import type { StoragePort } from "./storagePort.js";
import type { SafeGoldEntry, Transaction } from "./types.js";

// Bump when the cached shape changes, so an old snapshot is ignored rather than
// fed to code that no longer understands it.
const VERSION = 1;

export const CACHE_KEY = (userId: string) => `bb-cache:${userId}`;

export type CacheSnapshot = {
  transactions: Transaction[];
  lbpPerUsd: number;
  safeGoldEntries: SafeGoldEntry[];
};

type Stored = CacheSnapshot & { v: number };

// Pure parse/validate step, deliberately split from *reading* the raw string:
// web needs that read to be synchronous (StoreProvider seeds its initial
// state from it, so the very first frame shows real numbers — see
// src/lib/store.tsx's initialCache), which a StoragePort can't promise on
// native. Each shell reads its raw bytes however it can (sync localStorage,
// async AsyncStorage) and hands the result here.
export function parseCacheSnapshot(raw: string | null): CacheSnapshot | null {
  try {
    // Stryker disable next-line ConditionalExpression : equivalent — without
    // this guard a missing entry parses to null and the property read below
    // throws into the same catch, returning null either way. Kept as the
    // cheap, explicit path.
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (parsed.v !== VERSION || !Array.isArray(parsed.transactions)) return null;
    return {
      transactions: parsed.transactions,
      lbpPerUsd: parsed.lbpPerUsd,
      safeGoldEntries: parsed.safeGoldEntries ?? [],
    };
  } catch {
    // Corrupt / unparseable snapshot — act as if there's nothing cached.
    return null;
  }
}

export async function loadCache(storage: StoragePort, userId: string): Promise<CacheSnapshot | null> {
  return parseCacheSnapshot(await storage.get(CACHE_KEY(userId)));
}

export async function saveCache(
  storage: StoragePort,
  userId: string,
  snapshot: CacheSnapshot,
): Promise<void> {
  try {
    const stored: Stored = { v: VERSION, ...snapshot };
    await storage.set(CACHE_KEY(userId), JSON.stringify(stored));
  } catch {
    // Storage full or unavailable (e.g. private mode) — the cache is a nicety,
    // so a failed write is fine to swallow.
  }
}

export async function clearCache(storage: StoragePort, userId: string): Promise<void> {
  await storage.remove(CACHE_KEY(userId));
}
