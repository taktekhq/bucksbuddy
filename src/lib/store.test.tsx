import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { makeSupabaseMock, type Handler } from "@/test/supabaseMock";
import {
  generateMasterKey,
  makeVerifier,
  wrapMasterKey,
} from "@/lib/crypto";
import { encryptTransaction } from "@/lib/e2e";
import type { Transaction } from "@/types/db";

type Res = { error: string | null };

// A swappable supabase mock: each test sets `mock` before rendering.
let mock = makeSupabaseMock();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => mock.supabase.from(table),
    auth: {},
  },
}));

import { StoreProvider, useStore } from "@/lib/store";

function setup(handlers: Record<string, Handler> = {}) {
  mock = makeSupabaseMock(handlers);
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

describe("StoreProvider / useStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useStore())).toThrow(
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
    const { result } = setup({
      "profiles:select": () => ({ data: { lbp_per_usd: 90000 }, error: null }),
      "transactions:select": () => ({
        data: [inMonth, safeMove, safeWithdraw],
        error: null,
      }),
      "safe_gold_entries:select": () => ({
        data: [
          {
            id: "g1",
            user_id: "u1",
            is_deposit: true,
            grams: 5,
            note: null,
            occurred_at: now.toISOString(),
            created_at: now.toISOString(),
          },
          {
            id: "g2",
            user_id: "u1",
            is_deposit: false,
            grams: 2,
            note: null,
            occurred_at: now.toISOString(),
            created_at: now.toISOString(),
          },
        ],
        error: null,
      }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lbpPerUsd).toBe(90000);
    expect(result.current.transactions).toHaveLength(3);
    expect(result.current.monthlyNetCents).toBe(3000); // 5000 in − 2000 safe out
    expect(result.current.safeTotalCents).toBe(1500); // +2000 in, −500 out
    expect(result.current.safeGoldGrams).toBe(3); // 5 deposited - 2 withdrawn
  });

  it("tolerates null data and a missing profile rate", async () => {
    const { result } = setup({
      "profiles:select": () => ({ data: null, error: null }),
      "transactions:select": () => ({ data: null, error: null }),
      "safe_gold_entries:select": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transactions).toEqual([]);
    expect(result.current.safeGoldEntries).toEqual([]);
    expect(result.current.lbpPerUsd).toBe(89500); // default kept
  });

  it("adds a transaction optimistically", async () => {
    const inserted = tx({ id: "new", amount_usd_cents: 4242 });
    const { result } = setup({
      "transactions:insert": () => ({ data: inserted, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: string | null } = { error: "x" };
    await act(async () => {
      res = await result.current.addTransaction({
        is_income: false,
        category: "groceries",
        amount_usd_cents: 4242,
        original_currency: "USD",
        original_amount: 42.42,
        rate_used: 89500,
      });
    });
    expect(res.error).toBeNull();
    expect(result.current.transactions[0].id).toBe("new");
  });

  it("returns the error message when adding fails", async () => {
    const { result } = setup({
      "transactions:insert": () => ({ data: null, error: { message: "nope" } }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res: { error: string | null } = { error: null };
    await act(async () => {
      res = await result.current.addTransaction({
        is_income: false,
        category: "groceries",
        amount_usd_cents: 1,
        original_currency: "USD",
        original_amount: 0.01,
        rate_used: 89500,
      });
    });
    expect(res.error).toBe("nope");
  });

  it("updates a transaction in place, and surfaces update errors", async () => {
    const existing = tx({ id: "t1", note: "old" });
    const other = tx({ id: "t2", note: "keep" });
    const updated = tx({ id: "t1", note: "new" });
    const { result } = setup({
      "transactions:select": () => ({ data: [existing, other], error: null }),
      "transactions:update": () => ({ data: updated, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateTransaction("t1", {
        is_income: false,
        category: "groceries",
        amount_usd_cents: 1000,
        original_currency: "USD",
        original_amount: 10,
        rate_used: 89500,
        note: "new",
      });
    });
    expect(result.current.transactions[0].note).toBe("new");
    expect(result.current.transactions[1].note).toBe("keep"); // untouched row

    mock = makeSupabaseMock({
      "transactions:update": () => ({ data: null, error: { message: "boom" } }),
    });
    let res: { error: string | null } = { error: null };
    await act(async () => {
      res = await result.current.updateTransaction("t1", {
        is_income: false,
        category: "groceries",
        amount_usd_cents: 1000,
        original_currency: "USD",
        original_amount: 10,
        rate_used: 89500,
      });
    });
    expect(res.error).toBe("boom");
  });

  it("deletes a transaction, restoring it on failure", async () => {
    const a = tx({ id: "a" });
    const b = tx({ id: "b" });
    const { result } = setup({
      "transactions:select": () => ({ data: [a, b], error: null }),
      "transactions:delete": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteTransaction("a");
    });
    expect(result.current.transactions.map((t) => t.id)).toEqual(["b"]);

    // Now make deletion fail; the row should be restored.
    mock = makeSupabaseMock({
      "transactions:delete": () => ({ data: null, error: { message: "fail" } }),
    });
    let res: { error: string | null } = { error: null };
    await act(async () => {
      res = await result.current.deleteTransaction("b");
    });
    expect(res.error).toBe("fail");
    expect(result.current.transactions.map((t) => t.id)).toEqual(["b"]);
  });

  it("sets the exchange rate, and surfaces rate errors", async () => {
    const { result } = setup({
      "profiles:update": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setRate(95000);
    });
    expect(result.current.lbpPerUsd).toBe(95000);

    mock = makeSupabaseMock({
      "profiles:update": () => ({ data: null, error: { message: "denied" } }),
    });
    let res: { error: string | null } = { error: null };
    await act(async () => {
      res = await result.current.setRate(96000);
    });
    expect(res.error).toBe("denied");
  });

  it("adds and deletes gold entries, restoring on delete failure", async () => {
    const entry = {
      id: "g1",
      user_id: "u1",
      is_deposit: true,
      grams: 3,
      note: null,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const { result } = setup({
      "safe_gold_entries:insert": () => ({ data: entry, error: null }),
      "safe_gold_entries:delete": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addSafeGoldEntry({ is_deposit: true, grams: 3 });
    });
    expect(result.current.safeGoldGrams).toBe(3);

    await act(async () => {
      await result.current.deleteSafeGoldEntry("g1");
    });
    expect(result.current.safeGoldEntries).toEqual([]);
  });

  it("surfaces gold add errors and restores on gold delete failure", async () => {
    const entry = {
      id: "g1",
      user_id: "u1",
      is_deposit: true,
      grams: 3,
      note: null,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const { result } = setup({
      "safe_gold_entries:select": () => ({ data: [entry], error: null }),
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

    let addRes: { error: string | null } = { error: null };
    await act(async () => {
      addRes = await result.current.addSafeGoldEntry({
        is_deposit: true,
        grams: 1,
      });
    });
    expect(addRes.error).toBe("gold-fail");

    let delRes: { error: string | null } = { error: null };
    await act(async () => {
      delRes = await result.current.deleteSafeGoldEntry("g1");
    });
    expect(delRes.error).toBe("del-fail");
    expect(result.current.safeGoldEntries).toHaveLength(1); // restored
  });

  it("exposes refresh for manual reloads", async () => {
    const { result } = setup({
      "transactions:select": () => ({ data: [tx({ id: "r1" })], error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.transactions[0].id).toBe("r1");
  });

  it("starts locked for a passphrase user and unlocks with the right one", async () => {
    const mk = await generateMasterKey();
    const row = {
      wrapped_key: await wrapMasterKey(mk, "pw"),
      wrap_type: "passphrase",
      verifier: await makeVerifier(mk),
    };
    const ciphertext = await encryptTransaction(
      mk,
      tx({ id: "enc", amount_usd_cents: 7777, note: "k" }),
    );
    const encRow = {
      id: "enc",
      user_id: "u1",
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      ciphertext,
      is_income: null,
      category: null,
      amount_usd_cents: null,
      original_currency: null,
      original_amount: null,
      rate_used: null,
      note: null,
    };
    const { result } = setup({
      "e2e_keys:select": () => ({ data: row }),
      "transactions:select": () => ({ data: [encRow] }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);
    expect(result.current.e2eMode).toBe("passphrase");
    expect(result.current.transactions).toEqual([]); // can't decrypt yet

    let res: Res = { error: null };
    await act(async () => {
      res = await result.current.unlock("nope");
    });
    expect(res.error).toBe("Wrong passphrase.");
    expect(result.current.locked).toBe(true);

    await act(async () => {
      res = await result.current.unlock("pw");
    });
    expect(res.error).toBeNull();
    expect(result.current.locked).toBe(false);
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].amount_usd_cents).toBe(7777);
    expect(result.current.transactions[0].note).toBe("k");
  });

  it("turns encryption on then off on the default tier", async () => {
    const { result } = setup({
      "e2e_keys:update": () => ({ data: null, error: null }),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.e2eMode).toBe("default");

    await act(async () => {
      await result.current.enableEncryption("a strong passphrase!");
    });
    expect(result.current.e2eMode).toBe("passphrase");

    await act(async () => {
      await result.current.disableEncryption();
    });
    expect(result.current.e2eMode).toBe("default");
  });

  it("blocks writes and key changes while locked", async () => {
    const mk = await generateMasterKey();
    const row = {
      wrapped_key: await wrapMasterKey(mk, "pw"),
      wrap_type: "passphrase",
      verifier: await makeVerifier(mk),
    };
    const { result } = setup({ "e2e_keys:select": () => ({ data: row }) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);

    const newTx = {
      is_income: false,
      category: "x",
      amount_usd_cents: 1,
      original_currency: "USD" as const,
      original_amount: 0.01,
      rate_used: 89500,
    };
    const results: Res[] = [];
    await act(async () => {
      results.push(await result.current.addTransaction(newTx));
      results.push(await result.current.updateTransaction("z", newTx));
      results.push(await result.current.enableEncryption("pw2"));
      results.push(await result.current.disableEncryption());
    });
    for (const r of results) expect(r.error).toMatch(/Locked/);
  });
});
