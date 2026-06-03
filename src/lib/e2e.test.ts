import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type Handler } from "@/test/supabaseMock";

// Real crypto, mocked database.
let mock = makeSupabaseMock();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (t: string) => mock.supabase.from(t) },
}));

import {
  DEFAULT_PASSPHRASE,
  encryptString,
  generateMasterKey,
  makeVerifier,
  wrapMasterKey,
} from "@/lib/crypto";
import {
  decryptTransaction,
  disablePassphrase,
  enablePassphrase,
  encryptTransaction,
  loadVault,
  unlockVault,
} from "@/lib/e2e";

function set(handlers: Record<string, Handler> = {}) {
  mock = makeSupabaseMock(handlers);
}

async function keyRow(passphrase: string, wrap_type: "default" | "passphrase") {
  const mk = await generateMasterKey();
  return {
    mk,
    row: {
      wrapped_key: await wrapMasterKey(mk, passphrase),
      wrap_type,
      verifier: await makeVerifier(mk),
    },
  };
}

const SAMPLE = {
  is_income: true,
  category: "pay",
  amount_usd_cents: 12345,
  original_currency: "USD" as const,
  original_amount: 123.45,
  rate_used: 89500,
};

describe("e2e vault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bootstraps a brand-new user as unlocked default-tier", async () => {
    set(); // no e2e_keys row
    const v = await loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status === "unlocked") {
      expect(v.mode).toBe("default");
      expect(await encryptString(v.masterKey, "x")).toBeTruthy();
    }
    expect(
      mock.calls.some((c) => c.table === "e2e_keys" && c.op === "insert"),
    ).toBe(true);
  });

  it("loads an existing default-tier row unlocked, no insert", async () => {
    const { row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    set({ "e2e_keys:select": () => ({ data: row }) });
    const v = await loadVault("u1");
    expect(v.status).toBe("unlocked");
    expect(
      mock.calls.some((c) => c.table === "e2e_keys" && c.op === "insert"),
    ).toBe(false);
  });

  it("returns locked for a passphrase-tier row", async () => {
    const { row } = await keyRow("hunter2hunter", "passphrase");
    set({ "e2e_keys:select": () => ({ data: row }) });
    expect((await loadVault("u1")).status).toBe("locked");
  });

  it("unlocks with the right passphrase; rejects wrong and missing", async () => {
    const { row } = await keyRow("hunter2hunter", "passphrase");
    set({ "e2e_keys:select": () => ({ data: row }) });
    expect(await unlockVault("u1", "hunter2hunter")).not.toBeNull();
    expect(await unlockVault("u1", "nope")).toBeNull();

    set({ "e2e_keys:select": () => ({ data: null }) });
    expect(await unlockVault("u1", "hunter2hunter")).toBeNull();
  });

  it("rejects a right passphrase whose verifier doesn't match the key", async () => {
    const mk = await generateMasterKey();
    const wrongKey = await generateMasterKey();
    const row = {
      wrapped_key: await wrapMasterKey(mk, "pw"),
      wrap_type: "passphrase" as const,
      verifier: await makeVerifier(wrongKey),
    };
    set({ "e2e_keys:select": () => ({ data: row }) });
    expect(await unlockVault("u1", "pw")).toBeNull();
  });

  it("enables and disables a passphrase by re-wrapping the key", async () => {
    const mk = await generateMasterKey();
    set();
    await enablePassphrase("u1", mk, "my passphrase");
    await disablePassphrase("u1", mk);
    expect(
      mock.calls.filter((c) => c.table === "e2e_keys" && c.op === "update"),
    ).toHaveLength(2);
  });

  it("round-trips a transaction's secret fields, with and without a note", async () => {
    const mk = await generateMasterKey();
    const withNote = await encryptTransaction(mk, { ...SAMPLE, note: "rent" });
    expect(await decryptTransaction(mk, withNote)).toMatchObject({
      category: "pay",
      amount_usd_cents: 12345,
      note: "rent",
    });
    const noNote = await encryptTransaction(mk, SAMPLE);
    expect((await decryptTransaction(mk, noNote)).note).toBeNull();
  });
});
