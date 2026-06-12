// A per-user snapshot of the last loaded data, kept in localStorage so the app
// can paint real numbers on the very first frame instead of zeros-then-pop. It
// never replaces the network read — it just fills the gap until the fresh data
// lands and overwrites it.
//
// Privacy: this holds *decrypted* amounts. That's the same trust boundary the
// app already lives by — passphrase-tier devices cache the passphrase here too
// (see lib/e2e) — so the snapshot is no more exposed than the key that unlocks
// it. It's only ever written while unlocked, and it's cleared on sign-out,
// account deletion, and whenever a device turns out to be locked.
import type { SafeGoldEntry, Transaction } from "@/types/db";

// Bump when the cached shape changes, so an old snapshot is ignored rather than
// fed to code that no longer understands it.
const VERSION = 1;

const CACHE_KEY = (userId: string) => `bb-cache:${userId}`;

export type CacheSnapshot = {
  transactions: Transaction[];
  lbpPerUsd: number;
  safeGoldEntries: SafeGoldEntry[];
};

type Stored = CacheSnapshot & { v: number };

export function loadCache(userId: string): CacheSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(userId));
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

export function saveCache(userId: string, snapshot: CacheSnapshot): void {
  try {
    const stored: Stored = { v: VERSION, ...snapshot };
    localStorage.setItem(CACHE_KEY(userId), JSON.stringify(stored));
  } catch {
    // Storage full or unavailable (e.g. private mode) — the cache is a nicety,
    // so a failed write is fine to swallow.
  }
}

export function clearCache(userId: string): void {
  localStorage.removeItem(CACHE_KEY(userId));
}
