// Ported from the web's src/lib/store.test.tsx — same behaviours, same
// assertions wherever the port kept them. What differs is called out in the
// test names: the cache and the vault are awaited here (so hydration lands a
// tick later rather than synchronously), a delete rollback re-inserts the one
// removed row instead of restoring a whole snapshot, and a failed read leaves
// what's on screen alone.
//
// The vault is mocked (its own suite covers the crypto); only its masking
// helpers are kept real, because the locked screen is judged on what the user
// actually sees. The cache is NOT mocked — it runs against the faked
// AsyncStorage, exactly as the web's runs against localStorage.
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SafeGoldEntry, Transaction } from "@/types/db";

type Res = { error: string | null };
type QueryResult = { data?: unknown; error?: { message: string } | null };
type Handler = () => QueryResult | Promise<QueryResult>;

// --- supabase -------------------------------------------------------------
// A chainable query-builder mock, the twin of the web's src/test/supabaseMock.
// Awaiting a builder resolves the handler registered for "<table>:<op>".
let mockHandlers: Record<string, Handler> = {};

function mockFrom(table: string) {
  let op = "select";
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: () => {
      op = "insert";
      return builder;
    },
    upsert: () => {
      op = "upsert";
      return builder;
    },
    update: () => {
      op = "update";
      return builder;
    },
    delete: () => {
      op = "delete";
      return builder;
    },
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    then: (
      resolve: (v: QueryResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      const handler = mockHandlers[`${table}:${op}`] ?? mockHandlers[table];
      const result = handler ? handler() : { data: null, error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

const mockSignOut = jest.fn(async () => ({ error: null }));
const mockInvoke = jest.fn(
  async (): Promise<{ data: unknown; error: { message: string } | null }> => ({
    data: { ok: true },
    error: null,
  }),
);

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: { signOut: (...args: unknown[]) => mockSignOut(...args) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

const mockNavigate = jest.fn();
jest.mock("@/lib/router", () => ({
  navigate: (...args: unknown[]) => mockNavigate(...args),
}));

// --- vault ----------------------------------------------------------------
const mockVault = {
  lockedMessage: undefined as string | undefined,
  loadVault: jest.fn(),
  unlockVault: jest.fn(),
  enablePassphrase: jest.fn(),
  disablePassphrase: jest.fn(),
  rowToTransaction: jest.fn(),
  rowToGold: jest.fn(),
  encryptTxValues: jest.fn(),
  encryptGoldValues: jest.fn(),
};
const mockLoadStoredPassphrase = jest.fn();
const mockStoreStoredPassphrase = jest.fn();
const mockClearStoredPassphrase = jest.fn();

jest.mock("@/lib/vault", () => {
  const actual = jest.requireActual("@/lib/vault");
  return {
    ...actual,
    // maskedTransaction / maskedGold stay real.
    vault: {
      get lockedMessage() {
        return mockVault.lockedMessage;
      },
      loadVault: (...a: unknown[]) => mockVault.loadVault(...a),
      unlockVault: (...a: unknown[]) => mockVault.unlockVault(...a),
      enablePassphrase: (...a: unknown[]) => mockVault.enablePassphrase(...a),
      disablePassphrase: (...a: unknown[]) => mockVault.disablePassphrase(...a),
      rowToTransaction: (...a: unknown[]) => mockVault.rowToTransaction(...a),
      rowToGold: (...a: unknown[]) => mockVault.rowToGold(...a),
      encryptTxValues: (...a: unknown[]) => mockVault.encryptTxValues(...a),
      encryptGoldValues: (...a: unknown[]) => mockVault.encryptGoldValues(...a),
    },
    loadStoredPassphrase: (...a: unknown[]) => mockLoadStoredPassphrase(...a),
    storeStoredPassphrase: (...a: unknown[]) => mockStoreStoredPassphrase(...a),
    clearStoredPassphrase: (...a: unknown[]) => mockClearStoredPassphrase(...a),
  };
});

import { LOCKED_MSG } from "@/lib/vault";
import { StoreProvider, useStore } from "@/lib/store";

const KEY = new Uint8Array(32).fill(7);
const CACHE_KEY = "bb-cache:u1";

function setup(handlers: Record<string, Handler> = {}) {
  mockHandlers = handlers;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StoreProvider userId="u1">{children}</StoreProvider>
  );
  return renderHook(() => useStore(), { wrapper });
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
    occurred_at: new Date().toISOString(),
    note: null,
    created_at: new Date().toISOString(),
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
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const newTx = {
  is_income: false,
  category: "groceries",
  amount_usd_cents: 4242,
  original_currency: "USD" as const,
  original_amount: 42.42,
  rate_used: 89500,
};

function deferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

beforeEach(() => {
  mockHandlers = {};
  mockVault.lockedMessage = LOCKED_MSG;
  mockVault.loadVault.mockResolvedValue({
    status: "unlocked",
    mode: "default",
    masterKey: KEY,
  });
  mockVault.unlockVault.mockResolvedValue(null);
  mockVault.enablePassphrase.mockResolvedValue(undefined);
  mockVault.disablePassphrase.mockResolvedValue(undefined);
  // Stand-ins for decryption: the plaintext columns straight through.
  mockVault.rowToTransaction.mockImplementation(
    async (row: Record<string, unknown>) => ({
      id: row.id,
      user_id: row.user_id,
      is_income: row.is_income,
      category: row.category,
      original_currency: row.original_currency,
      rate_used: row.rate_used,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      amount_usd_cents: row.amount_usd_cents ?? 0,
      original_amount: row.original_amount ?? 0,
      note: row.note ?? null,
    }),
  );
  mockVault.rowToGold.mockImplementation(async (row: Record<string, unknown>) => ({
    id: row.id,
    user_id: row.user_id,
    is_deposit: row.is_deposit,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    grams: row.grams ?? 0,
    note: row.note ?? null,
  }));
  mockVault.encryptTxValues.mockResolvedValue({
    amount_usd_cents_enc: "AENC",
    original_amount_enc: "OENC",
    note_enc: null,
  });
  mockVault.encryptGoldValues.mockResolvedValue({
    grams_enc: "GENC",
    note_enc: null,
  });
  mockLoadStoredPassphrase.mockResolvedValue(null);
  mockStoreStoredPassphrase.mockResolvedValue(undefined);
  mockClearStoredPassphrase.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue({ error: null });
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("StoreProvider / useStore", () => {
  it("throws when used outside the provider", async () => {
    await expect(renderHook(() => useStore())).rejects.toThrow(
      /useStore must be used within StoreProvider/,
    );
  });

  it("loads profile, transactions and gold, deriving totals", async () => {
    const now = new Date();
    const inMonth = tx({
      id: "a",
      occurred_at: now.toISOString(),
      is_income: true,
      amount_usd_cents: 5000,
    });
    const safeMove = tx({
      id: "b",
      category: "safe",
      is_income: false,
      amount_usd_cents: 2000,
    });
    // A safe withdrawal (income) so both arms of the safe-total sum run.
    const safeWithdraw = tx({
      id: "c",
      category: "safe",
      is_income: true,
      amount_usd_cents: 500,
      occurred_at: new Date("2020-01-01").toISOString(), // outside this month
    });
    const { result } = await setup({
      "profiles:select": () => ({ data: { lbp_per_usd: 90000 }, error: null }),
      "transactions:select": () => ({
        data: [inMonth, safeMove, safeWithdraw],
        error: null,
      }),
      "safe_gold_entries:select": () => ({
        data: [gold({ id: "g1", is_deposit: true, grams: 5 }), gold({ id: "g2", is_deposit: false, grams: 2 })],
        error: null,
      }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lbpPerUsd).toBe(90000);
    expect(result.current.transactions).toHaveLength(3);
    expect(result.current.monthlyNetCents).toBe(3000); // 5000 in − 2000 safe out
    // Running balance carries all-time: +5000 −2000 +500 (the 2020 withdrawal).
    expect(result.current.balanceCents).toBe(3500);
    expect(result.current.safeTotalCents).toBe(1500); // +2000 in, −500 out
    expect(result.current.safeGoldGrams).toBe(3); // 5 deposited - 2 withdrawn
  });

  it("tolerates null data and a missing profile rate", async () => {
    const { result } = await setup({
      "profiles:select": () => ({ data: null, error: null }),
      "transactions:select": () => ({ data: null, error: null }),
      "safe_gold_entries:select": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transactions).toEqual([]);
    expect(result.current.safeGoldEntries).toEqual([]);
    expect(result.current.lbpPerUsd).toBe(89500); // default kept
  });

  it("keeps what's on screen when the transactions read fails", async () => {
    // Mobile-only: the web ignored read errors and blanked the list; here a
    // blip leaves the last-known rows in place.
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        v: 1,
        transactions: [tx({ id: "cached" })],
        lbpPerUsd: 91000,
        safeGoldEntries: [],
      }),
    );
    const { result } = await setup({
      "transactions:select": () => ({ data: null, error: { message: "offline" } }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transactions.map((t) => t.id)).toEqual(["cached"]);
  });

  it("keeps what's on screen when the gold read fails", async () => {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        v: 1,
        transactions: [tx({ id: "cached" })],
        lbpPerUsd: 91000,
        safeGoldEntries: [gold()],
      }),
    );
    const { result } = await setup({
      "transactions:select": () => ({ data: [], error: null }),
      "safe_gold_entries:select": () => ({
        data: null,
        error: { message: "offline" },
      }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transactions.map((t) => t.id)).toEqual(["cached"]);
    expect(result.current.safeGoldEntries).toHaveLength(1);
  });

  it("adds a transaction optimistically", async () => {
    const inserted = tx({ id: "new", amount_usd_cents: 4242 });
    const { result } = await setup({
      "transactions:insert": () => ({ data: inserted, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: Res = { error: "x" };
    await act(async () => {
      res = await result.current.addTransaction(newTx);
    });
    expect(res.error).toBeNull();
    expect(result.current.transactions[0].id).toBe("new");
    expect(result.current.transactions[0].amount_usd_cents).toBe(4242);
    expect(result.current.transactions[0].note).toBeNull();

    // …and again with a note, so both arms of `tx.note ?? null` run.
    await act(async () => {
      res = await result.current.addTransaction({ ...newTx, note: "lunch" });
    });
    expect(result.current.transactions[0].note).toBe("lunch");
  });

  it("returns the error message when adding fails", async () => {
    const { result } = await setup({
      "transactions:insert": () => ({ data: null, error: { message: "nope" } }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.addTransaction(newTx);
    });
    expect(res.error).toBe("nope");
    expect(result.current.transactions).toEqual([]);
  });

  it("updates a transaction in place, and surfaces update errors", async () => {
    const existing = tx({ id: "t1", note: "old" });
    const other = tx({ id: "t2", note: "keep" });
    const updated = tx({ id: "t1", note: "new" });
    const { result } = await setup({
      "transactions:select": () => ({ data: [existing, other], error: null }),
      "transactions:update": () => ({ data: updated, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateTransaction("t1", {
        ...newTx,
        amount_usd_cents: 1000,
        note: "new",
      });
    });
    expect(result.current.transactions[0].note).toBe("new");
    expect(result.current.transactions[1].note).toBe("keep"); // untouched row

    mockHandlers = {
      "transactions:update": () => ({ data: null, error: { message: "boom" } }),
    };
    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.updateTransaction("t1", newTx);
    });
    expect(res.error).toBe("boom");
  });

  it("deletes a transaction, putting the one row back on failure", async () => {
    const a = tx({ id: "a", occurred_at: "2026-02-01T00:00:00.000Z" });
    const b = tx({ id: "b", occurred_at: "2026-01-01T00:00:00.000Z" });
    const { result } = await setup({
      "transactions:select": () => ({ data: [a, b], error: null }),
      "transactions:delete": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteTransaction("a");
    });
    expect(result.current.transactions.map((t) => t.id)).toEqual(["b"]);

    // Now make deletion fail; the row goes back, newest-first.
    mockHandlers = {
      "transactions:delete": () => ({ data: null, error: { message: "fail" } }),
    };
    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.deleteTransaction("b");
    });
    expect(res.error).toBe("fail");
    expect(result.current.transactions.map((t) => t.id)).toEqual(["b"]);
  });

  it("restores the removed row in date order, and only once", async () => {
    const a = tx({ id: "a", occurred_at: "2026-02-01T00:00:00.000Z" });
    const b = tx({ id: "b", occurred_at: "2026-03-01T00:00:00.000Z" });
    const { result } = await setup({
      "transactions:select": () => ({ data: [b, a], error: null }),
      "transactions:delete": () => ({ data: null, error: { message: "fail" } }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Two failing deletes of the same row race (the native confirm sheet is
    // async): the second must not add a duplicate.
    let results: Res[] = [];
    await act(async () => {
      results = await Promise.all([
        result.current.deleteTransaction("a"),
        result.current.deleteTransaction("a"),
      ]);
    });
    expect(results.map((r) => r.error)).toEqual(["fail", "fail"]);
    expect(result.current.transactions.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("reports a failed delete of a row it doesn't hold", async () => {
    const { result } = await setup({
      "transactions:select": () => ({ data: [tx({ id: "a" })], error: null }),
      "transactions:delete": () => ({ data: null, error: { message: "fail" } }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.deleteTransaction("ghost");
    });
    expect(res.error).toBe("fail");
    expect(result.current.transactions.map((t) => t.id)).toEqual(["a"]);
  });

  it("sets the exchange rate, and surfaces rate errors", async () => {
    const { result } = await setup({
      "profiles:update": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setRate(95000);
    });
    expect(result.current.lbpPerUsd).toBe(95000);

    mockHandlers = {
      "profiles:update": () => ({ data: null, error: { message: "denied" } }),
    };
    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.setRate(96000);
    });
    expect(res.error).toBe("denied");
    expect(result.current.lbpPerUsd).toBe(95000);
  });

  it("adds and deletes gold entries, restoring on delete failure", async () => {
    const entry = gold({ id: "g1", is_deposit: true, grams: 3 });
    const { result } = await setup({
      "safe_gold_entries:insert": () => ({ data: entry, error: null }),
      "safe_gold_entries:delete": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addSafeGoldEntry({ is_deposit: true, grams: 3 });
    });
    expect(result.current.safeGoldGrams).toBe(3);
    expect(result.current.safeGoldEntries[0].note).toBeNull(); // no-note path

    mockHandlers = {
      ...mockHandlers,
      "safe_gold_entries:insert": () => ({
        data: gold({ id: "g2", is_deposit: true, grams: 2 }),
        error: null,
      }),
    };
    await act(async () => {
      await result.current.addSafeGoldEntry({
        is_deposit: true,
        grams: 2,
        note: "ring",
      });
    });
    expect(result.current.safeGoldEntries[0].note).toBe("ring"); // note path
    expect(result.current.safeGoldGrams).toBe(5);

    await act(async () => {
      await result.current.deleteSafeGoldEntry("g1");
    });
    expect(result.current.safeGoldEntries.map((e) => e.id)).toEqual(["g2"]);
  });

  it("surfaces gold add errors and restores on gold delete failure", async () => {
    const older = gold({ id: "g1", occurred_at: "2026-01-01T00:00:00.000Z" });
    const newer = gold({ id: "g2", occurred_at: "2026-02-01T00:00:00.000Z" });
    const { result } = await setup({
      "safe_gold_entries:select": () => ({ data: [newer, older], error: null }),
      "safe_gold_entries:insert": () => ({
        data: null,
        error: { message: "gold-fail" },
      }),
      "safe_gold_entries:delete": () => ({
        data: null,
        error: { message: "del-fail" },
      }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let addRes: Res = { error: null };
    await act(async () => {
      addRes = await result.current.addSafeGoldEntry({ is_deposit: true, grams: 1 });
    });
    expect(addRes.error).toBe("gold-fail");

    // Two racing failed deletes: restored once, in date order.
    let delResults: Res[] = [];
    await act(async () => {
      delResults = await Promise.all([
        result.current.deleteSafeGoldEntry("g1"),
        result.current.deleteSafeGoldEntry("g1"),
      ]);
    });
    expect(delResults.map((r) => r.error)).toEqual(["del-fail", "del-fail"]);
    expect(result.current.safeGoldEntries.map((e) => e.id)).toEqual(["g2", "g1"]);

    // An entry the store doesn't hold: nothing to put back.
    let ghost: Res = { error: null };
    await act(async () => {
      ghost = await result.current.deleteSafeGoldEntry("ghost");
    });
    expect(ghost.error).toBe("del-fail");
    expect(result.current.safeGoldEntries).toHaveLength(2);
  });

  it("exposes refresh for manual reloads", async () => {
    const { result } = await setup({
      "transactions:select": () => ({ data: [tx({ id: "r1" })], error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockHandlers = {
      "transactions:select": () => ({ data: [tx({ id: "r2" })], error: null }),
    };
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.transactions[0].id).toBe("r2");
  });

  it("starts locked for a passphrase user and unlocks with the right one", async () => {
    mockVault.loadVault.mockResolvedValue({ status: "locked", mode: "passphrase" });
    const encRow = {
      id: "enc",
      user_id: "u1",
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_income: false,
      category: "groceries",
      original_currency: "USD",
      rate_used: 89500,
      amount_usd_cents_enc: "ci!ph3r",
      original_amount_enc: "o",
      note_enc: null,
      amount_usd_cents: 7777,
      original_amount: 77.77,
      note: "k",
    };
    const encGoldRow = {
      id: "eg",
      user_id: "u1",
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_deposit: true,
      grams_enc: "gr4ms",
      note_enc: null,
      grams: 9,
    };
    const { result } = await setup({
      "transactions:select": () => ({ data: [encRow] }),
      "safe_gold_entries:select": () => ({ data: [encGoldRow] }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);
    expect(result.current.e2eMode).toBe("passphrase");
    // Locked: rows are shown obscured (masked), not blank.
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].amountMask).toEqual(expect.any(String));
    expect(result.current.transactions[0].amount_usd_cents).toBe(0);
    expect(result.current.safeGoldEntries[0].gramsMask).toEqual(expect.any(String));

    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.unlock("nope");
    });
    // The web says "Wrong passphrase." here; this port surfaces the vault's
    // locked message instead (see behaviourDifferences).
    expect(res.error).toBe(LOCKED_MSG);
    expect(result.current.locked).toBe(true);

    mockVault.unlockVault.mockResolvedValue(KEY);
    await act(async () => {
      res = await result.current.unlock("pw");
    });
    expect(res.error).toBeNull();
    expect(result.current.locked).toBe(false);
    expect(result.current.passphrase).toBe("pw"); // cached for display
    expect(mockStoreStoredPassphrase).toHaveBeenCalledWith("u1", "pw"); // persisted
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].amount_usd_cents).toBe(7777);
    expect(result.current.transactions[0].note).toBe("k");
    expect(result.current.transactions[0].amountMask).toBeUndefined();
    expect(result.current.safeGoldGrams).toBe(9); // decrypted gold
  });

  it("falls back to a generic message when the vault has none", async () => {
    // `vault.lockedMessage` is what the Expo Go build sets to explain itself;
    // with it unset the store's own wording stands in.
    mockVault.lockedMessage = undefined;
    mockVault.loadVault.mockResolvedValue({ status: "locked", mode: "passphrase" });
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.unlock("nope");
    });
    expect(res.error).toBe("Wrong passphrase.");

    await act(async () => {
      res = await result.current.addTransaction(newTx);
    });
    expect(res.error).toBe(LOCKED_MSG);
  });

  it("auto-unlocks on load from the device-stored passphrase", async () => {
    mockVault.loadVault.mockResolvedValue({ status: "locked", mode: "passphrase" });
    mockLoadStoredPassphrase.mockResolvedValue("pw");
    mockVault.unlockVault.mockResolvedValue(KEY);

    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockVault.unlockVault).toHaveBeenCalledWith("u1", "pw");
    expect(result.current.locked).toBe(false);
    expect(result.current.passphrase).toBe("pw");
    expect(mockClearStoredPassphrase).not.toHaveBeenCalled();
  });

  it("drops a stale stored passphrase and stays locked", async () => {
    mockVault.loadVault.mockResolvedValue({ status: "locked", mode: "passphrase" });
    mockLoadStoredPassphrase.mockResolvedValue("old-passphrase"); // changed elsewhere
    mockVault.unlockVault.mockResolvedValue(null);

    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);
    expect(result.current.passphrase).toBeNull();
    expect(mockClearStoredPassphrase).toHaveBeenCalledWith("u1"); // cleared
  });

  it("turns encryption on then off on the default tier", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.e2eMode).toBe("default");

    await act(async () => {
      await result.current.enableEncryption("a strong passphrase!");
    });
    expect(mockVault.enablePassphrase).toHaveBeenCalledWith(
      "u1",
      KEY,
      "a strong passphrase!",
    );
    expect(result.current.e2eMode).toBe("passphrase");
    expect(result.current.passphrase).toBe("a strong passphrase!");
    expect(mockStoreStoredPassphrase).toHaveBeenCalledWith(
      "u1",
      "a strong passphrase!",
    );

    await act(async () => {
      await result.current.disableEncryption();
    });
    expect(mockVault.disablePassphrase).toHaveBeenCalledWith("u1", KEY);
    expect(result.current.e2eMode).toBe("default");
    expect(result.current.passphrase).toBeNull();
    expect(mockClearStoredPassphrase).toHaveBeenCalledWith("u1");
  });

  it("clears the device secrets and signs out", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enableEncryption("a strong passphrase!");
    });
    expect(result.current.passphrase).toBe("a strong passphrase!");

    await act(async () => {
      await result.current.signOut();
    });
    expect(mockClearStoredPassphrase).toHaveBeenCalledWith("u1");
    expect(result.current.passphrase).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("deletes the account, then clears secrets and signs out", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enableEncryption("a strong passphrase!");
    });

    let res: Res = { error: "x" };
    await act(async () => {
      res = await result.current.deleteAccount();
    });
    expect(res.error).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("delete-account");
    expect(mockClearStoredPassphrase).toHaveBeenCalledWith("u1");
    expect(result.current.passphrase).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("surfaces a delete-account error without signing out", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: "delete failed" },
    });
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.deleteAccount();
    });
    expect(res.error).toBe("delete failed");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("hydrates from the cached snapshot, then refreshes", async () => {
    // A snapshot from a previous session: the app paints it before the network
    // read lands, then overwrites it. (On the web the hydrate is synchronous;
    // here it's one AsyncStorage read away.)
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        v: 1,
        transactions: [tx({ id: "cached", amount_usd_cents: 1234 })],
        lbpPerUsd: 91000,
        safeGoldEntries: [],
      }),
    );
    // Park the store just after hydration (the vault read is what comes next)
    // so the painted-from-cache frame can be inspected on its own.
    const vaultGate = deferred<unknown>();
    mockVault.loadVault.mockReturnValueOnce(vaultGate.promise);
    const fresh = deferred<QueryResult>();
    const { result } = await setup({
      "transactions:select": () => fresh.promise,
    });

    await waitFor(() => expect(result.current.transactions[0]?.id).toBe("cached"));
    expect(result.current.loading).toBe(false);
    expect(result.current.lbpPerUsd).toBe(91000);

    // The background refresh replaces it with what the server returned.
    await act(async () =>
      vaultGate.release({ status: "unlocked", mode: "default", masterKey: KEY }),
    );
    await act(async () =>
      fresh.release({
        data: [tx({ id: "fresh", amount_usd_cents: 5678 })],
        error: null,
      }),
    );
    await waitFor(() => expect(result.current.transactions[0].id).toBe("fresh"));
    expect(result.current.transactions[0].amount_usd_cents).toBe(5678);
  });

  it("writes a snapshot after loading so the next start is instant", async () => {
    const { result } = await setup({
      "transactions:select": () => ({ data: [tx({ id: "persisted" })], error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!).transactions[0].id).toBe("persisted");
    });
  });

  it("clears the cache and never caches plaintext while locked", async () => {
    mockVault.loadVault.mockResolvedValue({ status: "locked", mode: "passphrase" });
    // A stale plaintext snapshot left on a now-locked device must be dropped.
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        v: 1,
        transactions: [tx()],
        lbpPerUsd: 90000,
        safeGoldEntries: [],
      }),
    );
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);
    await expect(AsyncStorage.getItem(CACHE_KEY)).resolves.toBeNull();
  });

  it("drops the cached snapshot on sign-out", async () => {
    const { result } = await setup({
      "transactions:select": () => ({ data: [tx({ id: "x" })], error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(CACHE_KEY)).not.toBeNull(),
    );

    await act(async () => {
      await result.current.signOut();
    });
    await expect(AsyncStorage.getItem(CACHE_KEY)).resolves.toBeNull();
  });

  it("blocks writes and key changes while locked", async () => {
    mockVault.loadVault.mockResolvedValue({ status: "locked", mode: "passphrase" });
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);

    const results: Res[] = [];
    await act(async () => {
      results.push(await result.current.addTransaction(newTx));
      results.push(await result.current.updateTransaction("z", newTx));
      results.push(await result.current.enableEncryption("pw2"));
      results.push(await result.current.disableEncryption());
      results.push(
        await result.current.addSafeGoldEntry({ is_deposit: true, grams: 1 }),
      );
    });
    for (const r of results) expect(r.error).toMatch(/Locked/);
    expect(mockVault.encryptTxValues).not.toHaveBeenCalled();
  });

  it("drops a cache read that lands after the screen is gone", async () => {
    const late = deferred<string | null>();
    (AsyncStorage.getItem as jest.Mock).mockReturnValueOnce(late.promise);

    const { unmount } = await setup();
    await unmount();
    await act(async () => late.release(null));

    expect(mockVault.loadVault).not.toHaveBeenCalled();
  });

  it("drops a vault read that lands after the screen is gone", async () => {
    const late = deferred<{ status: string; mode: string; masterKey: Uint8Array }>();
    mockVault.loadVault.mockReturnValueOnce(late.promise);

    const { unmount } = await setup();
    await unmount();
    await act(async () =>
      late.release({ status: "unlocked", mode: "default", masterKey: KEY }),
    );

    expect(mockVault.rowToTransaction).not.toHaveBeenCalled();
  });

  it("drops an auto-unlock that lands after the screen is gone", async () => {
    mockVault.loadVault.mockResolvedValue({ status: "locked", mode: "passphrase" });
    mockLoadStoredPassphrase.mockResolvedValue("pw");
    const late = deferred<Uint8Array | null>();
    mockVault.unlockVault.mockReturnValueOnce(late.promise);

    const { unmount } = await setup();
    await unmount();
    await act(async () => late.release(KEY));

    expect(mockClearStoredPassphrase).not.toHaveBeenCalled();
  });
});
