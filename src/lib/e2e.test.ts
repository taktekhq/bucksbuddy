import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type Handler } from "@/test/supabaseMock";

// Real crypto, mocked database.
let mock = makeSupabaseMock();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (t: string) => mock.supabase.from(t) },
}));

import {
  DEFAULT_PASSPHRASE,
  decryptString,
  encryptString,
  generateMasterKey,
  makeVerifier,
  wrapMasterKey,
} from "@/lib/crypto";
import {
  cipherMask,
  clearStoredPassphrase,
  decryptGoldValues,
  decryptTxValues,
  disablePassphrase,
  enablePassphrase,
  encryptGoldValues,
  encryptTxValues,
  loadStoredPassphrase,
  loadVault,
  storeStoredPassphrase,
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

const SAMPLE = { amount_usd_cents: 12345, original_amount: 123.45 };

describe("e2e vault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bootstraps a brand-new user as unlocked default-tier", async () => {
    set(); // no e2e_keys row (and the re-read also finds none)
    const v = await loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status === "unlocked") {
      expect(v.mode).toBe("default");
      expect(await encryptString(v.masterKey, "x")).toBeTruthy();
    }
    expect(
      mock.calls.some((c) => c.table === "e2e_keys" && c.op === "upsert"),
    ).toBe(true);
  });

  it("respects a row a race created during bootstrap (re-read wins)", async () => {
    const { mk, row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    // First read (no row) triggers bootstrap; the re-read finds the racer's row.
    let calls = 0;
    set({ "e2e_keys:select": () => ({ data: calls++ === 0 ? null : row }) });
    const v = await loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status === "unlocked") {
      // Prove it adopted the stored key, not its own orphaned one: a blob the
      // loaded key encrypts must decrypt under the racer's key.
      const blob = await encryptString(v.masterKey, "x");
      expect(await decryptString(mk, blob)).toBe("x");
      expect(v.mode).toBe("default");
    }
  });

  it("loads an existing default-tier row unlocked, no upsert", async () => {
    const { row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    set({ "e2e_keys:select": () => ({ data: row }) });
    const v = await loadVault("u1");
    expect(v.status).toBe("unlocked");
    expect(
      mock.calls.some((c) => c.table === "e2e_keys" && c.op === "upsert"),
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

  it("round-trips a transaction's money values, with and without a note", async () => {
    const mk = await generateMasterKey();
    const withNote = await encryptTxValues(mk, { ...SAMPLE, note: "rent" });
    // Each value is independently encrypted (and not stored in the clear).
    expect(withNote.amount_usd_cents_enc).not.toContain("12345");
    expect(await decryptTxValues(mk, withNote)).toEqual({
      amount_usd_cents: 12345,
      original_amount: 123.45,
      note: "rent",
    });
    const noNote = await encryptTxValues(mk, SAMPLE);
    expect(noNote.note_enc).toBeNull();
    expect((await decryptTxValues(mk, noNote)).note).toBeNull();
  });

  it("round-trips a gold entry's money values, with and without a note", async () => {
    const mk = await generateMasterKey();
    const withNote = await encryptGoldValues(mk, { grams: 12.5, note: "wedding" });
    expect(await decryptGoldValues(mk, withNote)).toEqual({
      grams: 12.5,
      note: "wedding",
    });
    const noNote = await encryptGoldValues(mk, { grams: 1 });
    expect(noNote.note_enc).toBeNull();
    expect((await decryptGoldValues(mk, noNote)).note).toBeNull();
  });

  it("derives a short, garbled mask from a ciphertext (dots when absent)", () => {
    expect(cipherMask("aB12.cd34.ef56")).toBe("aB12"); // first alnum chars
    expect(cipherMask(null)).toBe("••••");
    expect(cipherMask("...")).toBe("••••"); // no alnum
  });

  it("stores, reads and clears the device passphrase", () => {
    expect(loadStoredPassphrase("u9")).toBeNull();
    storeStoredPassphrase("u9", "hunter2");
    expect(loadStoredPassphrase("u9")).toBe("hunter2");
    clearStoredPassphrase("u9");
    expect(loadStoredPassphrase("u9")).toBeNull();
  });
});
