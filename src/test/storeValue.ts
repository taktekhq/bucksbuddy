import { vi } from "vitest";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";

// A complete, overridable Store value for components that call useStore().
// Mutating methods default to resolving with no error.
export function makeStoreValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    transactions: [],
    lbpPerUsd: DEFAULT_LBP_PER_USD,
    monthlyNetCents: 0,
    addTransaction: vi.fn(async () => ({ error: null })),
    updateTransaction: vi.fn(async () => ({ error: null })),
    deleteTransaction: vi.fn(async () => ({ error: null })),
    setRate: vi.fn(async () => ({ error: null })),
    e2eMode: "default",
    locked: false,
    passphrase: null,
    unlock: vi.fn(async () => ({ error: null })),
    enableEncryption: vi.fn(async () => ({ error: null })),
    disableEncryption: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => {}),
    safeTotalCents: 0,
    safeGoldEntries: [],
    safeGoldGrams: 0,
    addSafeGoldEntry: vi.fn(async () => ({ error: null })),
    deleteSafeGoldEntry: vi.fn(async () => ({ error: null })),
    refresh: vi.fn(async () => {}),
    ...overrides,
  };
}
