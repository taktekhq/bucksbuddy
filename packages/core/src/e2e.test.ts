import { describe, it, expect, beforeEach } from "vitest";
import { makeSupabaseMock, type Handler } from "./test/supabaseMock";
import type { StoragePort } from "./storagePort";

// Real crypto, mocked database. Unlike before the extraction, the mock is
// passed to each function directly (supabase is a parameter now, not an
// import), so no module mocking is needed here at all.
let mock = makeSupabaseMock();

import {
  DEFAULT_PASSPHRASE,
  decryptString,
  encryptString,
  generateMasterKey,
  makeVerifier,
  unwrapMasterKey,
  wrapMasterKey,
} from "./crypto";
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
} from "./e2e";

function set(handlers: Record<string, Handler> = {}) {
  mock = makeSupabaseMock(handlers);
}

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
    set();
  });

  it("bootstraps a brand-new user as unlocked default-tier", async () => {
    set(); // no e2e_keys row (and the re-read also finds none)
    const v = await loadVault(mock.supabase as never, "u1");
    expect(v.status).toBe("unlocked");
    if (v.status === "unlocked") {
      expect(v.mode).toBe("default");
      expect(await encryptString(v.masterKey, "x")).toBeTruthy();
    }
    expect(mock.calls.some((c) => c.table === "e2e_keys" && c.op === "upsert")).toBe(true);
  });

  it("respects a row a race created during bootstrap (re-read wins)", async () => {
    const { mk, row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    // First read (no row) triggers bootstrap; the re-read finds the racer's row.
    let calls = 0;
    set({ "e2e_keys:select": () => ({ data: calls++ === 0 ? null : row }) });
    const v = await loadVault(mock.supabase as never, "u1");
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
    const v = await loadVault(mock.supabase as never, "u1");
    expect(v.status).toBe("unlocked");
    expect(mock.calls.some((c) => c.table === "e2e_keys" && c.op === "upsert")).toBe(false);
  });

  it("returns locked for a passphrase-tier row", async () => {
    const { row } = await keyRow("hunter2hunter", "passphrase");
    set({ "e2e_keys:select": () => ({ data: row }) });
    expect((await loadVault(mock.supabase as never, "u1")).status).toBe("locked");
  });

  it("unlocks with the right passphrase; rejects wrong and missing", async () => {
    const { row } = await keyRow("hunter2hunter", "passphrase");
    set({ "e2e_keys:select": () => ({ data: row }) });
    expect(await unlockVault(mock.supabase as never, "u1", "hunter2hunter")).not.toBeNull();
    expect(await unlockVault(mock.supabase as never, "u1", "nope")).toBeNull();

    set({ "e2e_keys:select": () => ({ data: null }) });
    expect(await unlockVault(mock.supabase as never, "u1", "hunter2hunter")).toBeNull();
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
    expect(await unlockVault(mock.supabase as never, "u1", "pw")).toBeNull();
  });

  it("enables and disables a passphrase by re-wrapping the key", async () => {
    const mk = await generateMasterKey();
    set();
    await enablePassphrase(mock.supabase as never, "u1", mk, "my passphrase");
    await disablePassphrase(mock.supabase as never, "u1", mk);
    expect(mock.calls.filter((c) => c.table === "e2e_keys" && c.op === "update")).toHaveLength(2);
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

  it("stores, reads and clears the device passphrase", async () => {
    const storage = memoryStorage();
    expect(await loadStoredPassphrase(storage, "u9")).toBeNull();
    await storeStoredPassphrase(storage, "u9", "hunter2");
    expect(await loadStoredPassphrase(storage, "u9")).toBe("hunter2");
    await clearStoredPassphrase(storage, "u9");
    expect(await loadStoredPassphrase(storage, "u9")).toBeNull();
  });
});

// --- the database contract --------------------------------------------------
// The queries above are asserted only by table and operation, which cannot tell
// a correct update from one that writes the wrong column or filters on the
// wrong user. These pin the arguments themselves.
describe("e2e_keys query shape", () => {
  const only = (op: string) => mock.calls.filter((c) => c.table === "e2e_keys" && c.op === op);

  it("reads the vault columns for one user", async () => {
    const { row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    set({ "e2e_keys:select": () => ({ data: row }) });
    await loadVault(mock.supabase as never, "u1");
    const [call] = only("select");
    expect(call.args.select[0][0]).toBe("wrapped_key, wrap_type, verifier");
    expect(call.args.eq[0]).toEqual(["user_id", "u1"]);
  });

  it("bootstraps a missing vault without clobbering a concurrent writer", async () => {
    set({ "e2e_keys:select": () => ({ data: null }) });
    await loadVault(mock.supabase as never, "u1");
    const [call] = only("upsert");
    const [payload, options] = call.args.upsert[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(payload.user_id).toBe("u1");
    expect(payload.wrap_type).toBe("default");
    expect(typeof payload.wrapped_key).toBe("string");
    expect(typeof payload.verifier).toBe("string");
    // Losing either of these turns the race from "first writer wins" into a
    // silent overwrite of someone's passphrase-wrapped key.
    expect(options).toEqual({ onConflict: "user_id", ignoreDuplicates: true });
  });

  it("re-wraps under the user's passphrase, for that user only", async () => {
    const mk = await generateMasterKey();
    set();
    await enablePassphrase(mock.supabase as never, "u1", mk, "my passphrase");
    const [call] = only("update");
    const [patch] = call.args.update[0] as [Record<string, unknown>];
    expect(patch.wrap_type).toBe("passphrase");
    expect(
      await decryptString(
        await unwrapMasterKey(patch.wrapped_key as string, "my passphrase"),
        await encryptString(mk, "ok"),
      ),
    ).toBe("ok");
    expect(call.args.eq[0]).toEqual(["user_id", "u1"]);
  });

  it("re-wraps back under the default passphrase, for that user only", async () => {
    const mk = await generateMasterKey();
    set();
    await disablePassphrase(mock.supabase as never, "u1", mk);
    const [call] = only("update");
    const [patch] = call.args.update[0] as [Record<string, unknown>];
    expect(patch.wrap_type).toBe("default");
    expect(call.args.eq[0]).toEqual(["user_id", "u1"]);
  });
});

describe("note encryption", () => {
  it("leaves an absent note as null rather than encrypting the word", async () => {
    const mk = await generateMasterKey();
    expect((await encryptTxValues(mk, { ...SAMPLE, note: null })).note_enc).toBeNull();
    expect((await encryptTxValues(mk, { ...SAMPLE })).note_enc).toBeNull();
    expect((await encryptGoldValues(mk, { grams: 1, note: null })).note_enc).toBeNull();
    expect((await encryptGoldValues(mk, { grams: 1 })).note_enc).toBeNull();
  });
});
