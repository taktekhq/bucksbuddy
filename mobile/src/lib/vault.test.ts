// Adapted from the web's ../../../src/lib/e2e.test.ts. The vault's *logic* is
// the web's — bootstrap, the race re-read, unlock, enable/disable, per-field
// encryption — so those assertions are kept. What is new here is the device
// layer the web doesn't have: the unwrapped master key cached in the OS
// keystore, checked against the account verifier, so a launch costs a keystore
// read instead of 600k PBKDF2 rounds.
//
// Real crypto, mocked database — as the web does. The one substitution is the
// KDF: 600k rounds is ~4s per derivation in pure JS, and this suite derives a
// dozen times. `crypto.test.ts` exercises the real thing; here PBKDF2 is
// swapped for a cheap deterministic stand-in, which keeps every other part of
// the envelope real (AES-GCM, the salt/iv/version framing, authentication —
// so a wrong passphrase still genuinely fails to open a wrapped key).
import { mockSecureStore } from "@/test/setup";

jest.mock("@noble/hashes/pbkdf2.js", () => ({
  pbkdf2Async: async (
    _hash: unknown,
    password: Uint8Array,
    salt: Uint8Array,
    opts: { dkLen: number },
  ) => {
    const { sha256 } = jest.requireActual("@noble/hashes/sha2.js");
    const input = new Uint8Array(password.length + salt.length);
    input.set(password, 0);
    input.set(salt, password.length);
    return sha256(input).slice(0, opts.dkLen);
  },
}));

// Real crypto, but with two entry points wrapped in spies: the vault's whole
// reason for existing is to NOT derive when it already has the key, and that
// is only observable by watching `unwrapMasterKey`.
jest.mock("@/lib/crypto", () => {
  const actual = jest.requireActual("@/lib/crypto");
  return {
    ...actual,
    keyFromB64: jest.fn(actual.keyFromB64),
    unwrapMasterKey: jest.fn(actual.unwrapMasterKey),
  };
});

type QueryResult = { data?: unknown; error?: { message: string } | null };
type Handler = () => QueryResult | Promise<QueryResult>;

// A chainable Supabase query-builder mock, same shape as the web's
// src/test/supabaseMock.ts: awaiting the builder resolves a handler looked up
// by "<table>:<op>", and every call is recorded with its payload.
let mockHandlers: Record<string, Handler> = {};
const mockCalls: { table: string; op: string; payload?: unknown }[] = [];

function mockFrom(table: string) {
  let op = "select";
  let payload: unknown;
  const builder: Record<string, unknown> = {
    select: () => builder,
    upsert: (v: unknown) => {
      op = "upsert";
      payload = v;
      return builder;
    },
    update: (v: unknown) => {
      op = "update";
      payload = v;
      return builder;
    },
    eq: () => builder,
    maybeSingle: () => builder,
    then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) => {
      mockCalls.push({ table, op, payload });
      const handler = mockHandlers[`${table}:${op}`] ?? mockHandlers[table];
      return Promise.resolve(handler ? handler() : { data: null, error: null }).then(
        resolve,
        reject,
      );
    },
  };
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import * as SecureStore from "expo-secure-store";
import {
  DEFAULT_PASSPHRASE,
  decryptString,
  encryptString,
  generateMasterKey,
  keyFromB64,
  keyToB64,
  makeVerifier,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto";
import {
  LOCKED_MSG,
  cipherMask,
  clearDeviceSecrets,
  clearStoredPassphrase,
  loadStoredPassphrase,
  maskedGold,
  maskedTransaction,
  storeStoredPassphrase,
  vault,
  type E2EMode,
} from "@/lib/vault";
import type {
  NewTransaction,
  SafeGoldEntryRow,
  TransactionRow,
} from "@/types/db";

// The repo's tsconfig doesn't pull in @types/jest (tests aren't part of the
// typecheck), so name the bits of the mock API this file reaches for.
type MockFn = ((...args: unknown[]) => unknown) & {
  mockRejectedValueOnce(value: unknown): void;
  mockImplementationOnce(fn: (...args: unknown[]) => unknown): void;
};

const getItem = SecureStore.getItemAsync as unknown as MockFn;
const setItem = SecureStore.setItemAsync as unknown as MockFn;
const deleteItem = SecureStore.deleteItemAsync as unknown as MockFn;
const unwrapSpy = unwrapMasterKey as unknown as MockFn;
const fromB64Spy = keyFromB64 as unknown as MockFn;

const PASS_KEY = "bb-e2e-pass_u1";
const CACHED_KEY = "bb-e2e-key_u1";

function set(handlers: Record<string, Handler> = {}) {
  mockHandlers = handlers;
  mockCalls.length = 0;
}

async function keyRow(passphrase: string, wrap_type: E2EMode) {
  const mk = generateMasterKey();
  return {
    mk,
    row: {
      wrapped_key: await wrapMasterKey(mk, passphrase),
      wrap_type,
      verifier: makeVerifier(mk),
    },
  };
}

const opsOn = (table: string, op: string) =>
  mockCalls.filter((c) => c.table === table && c.op === op);

const SAMPLE: NewTransaction = {
  is_income: false,
  category: "food",
  amount_usd_cents: 12345,
  original_currency: "USD",
  original_amount: 123.45,
  rate_used: 1,
};

const txRow = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  id: "t1",
  user_id: "u1",
  occurred_at: "2024-03-01T10:00:00Z",
  created_at: "2024-03-01T10:00:01Z",
  is_income: false,
  category: "food",
  original_currency: "USD",
  rate_used: 1,
  amount_usd_cents_enc: null,
  original_amount_enc: null,
  note_enc: null,
  ...over,
});

const goldRow = (over: Partial<SafeGoldEntryRow> = {}): SafeGoldEntryRow => ({
  id: "g1",
  user_id: "u1",
  occurred_at: "2024-03-01T10:00:00Z",
  created_at: "2024-03-01T10:00:01Z",
  is_deposit: true,
  grams_enc: null,
  note_enc: null,
  ...over,
});

beforeEach(() => set());

describe("vault: device secrets", () => {
  it("stores, reads and clears the device passphrase", async () => {
    expect(await loadStoredPassphrase("u1")).toBeNull();
    await storeStoredPassphrase("u1", "hunter2");
    expect(await loadStoredPassphrase("u1")).toBe("hunter2");
    // The keystore entry is pinned to this device and to an unlocked screen.
    expect(setItem).toHaveBeenCalledWith(PASS_KEY, "hunter2", {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await clearStoredPassphrase("u1"); // the alias the store still calls
    expect(await loadStoredPassphrase("u1")).toBeNull();
  });

  it("wipes both the passphrase and the cached key", async () => {
    mockSecureStore.set(PASS_KEY, "hunter2");
    mockSecureStore.set(CACHED_KEY, keyToB64(generateMasterKey()));
    await clearDeviceSecrets("u1");
    expect(mockSecureStore.size).toBe(0);
    expect(deleteItem).toHaveBeenCalledWith(PASS_KEY);
    expect(deleteItem).toHaveBeenCalledWith(CACHED_KEY);
  });

  it("treats a keystore that throws as simply empty", async () => {
    // No keystore, or a device that hasn't been unlocked since boot: reads come
    // back null, writes and deletes are silently dropped rather than crashing.
    getItem.mockRejectedValueOnce(new Error("keystore unavailable"));
    expect(await loadStoredPassphrase("u1")).toBeNull();

    setItem.mockRejectedValueOnce(new Error("keystore unavailable"));
    await expect(storeStoredPassphrase("u1", "hunter2")).resolves.toBeUndefined();
    expect(mockSecureStore.has(PASS_KEY)).toBe(false);

    deleteItem.mockRejectedValueOnce(new Error("keystore unavailable"));
    await expect(clearDeviceSecrets("u1")).resolves.toBeUndefined();
  });
});

describe("vault: masking a locked device", () => {
  it("derives a short, garbled mask from a ciphertext (dots when absent)", () => {
    expect(cipherMask("aB12.cd34.ef56")).toBe("aB12"); // first alnum chars
    expect(cipherMask(null)).toBe("••••");
    expect(cipherMask("...")).toBe("••••"); // no alnum
  });

  it("renders a transaction with its labels but a garbled amount", () => {
    expect(maskedTransaction(txRow({ amount_usd_cents_enc: "9zQ.abc" }))).toEqual({
      id: "t1",
      user_id: "u1",
      is_income: false,
      category: "food",
      original_currency: "USD",
      rate_used: 1,
      occurred_at: "2024-03-01T10:00:00Z",
      created_at: "2024-03-01T10:00:01Z",
      amount_usd_cents: 0,
      original_amount: 0,
      note: null,
      amountMask: "9zQa",
    });
  });

  it("renders a gold entry with its labels but garbled grams", () => {
    expect(maskedGold(goldRow({ grams_enc: "Kp7x.zz" }))).toEqual({
      id: "g1",
      user_id: "u1",
      is_deposit: true,
      occurred_at: "2024-03-01T10:00:00Z",
      created_at: "2024-03-01T10:00:01Z",
      grams: 0,
      note: null,
      gramsMask: "Kp7x",
    });
  });

  it("exposes the locked message", () => {
    expect(vault.lockedMessage).toBe(LOCKED_MSG);
  });
});

describe("vault: loadVault", () => {
  it("bootstraps a brand-new user as unlocked default-tier", async () => {
    set(); // no e2e_keys row (and the re-read also finds none)
    const v = await vault.loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status !== "unlocked") throw new Error("unreachable");
    expect(v.mode).toBe("default");
    expect(encryptString(v.masterKey, "x")).toBeTruthy();

    const upserts = opsOn("e2e_keys", "upsert");
    expect(upserts).toHaveLength(1);
    const payload = upserts[0].payload as {
      user_id: string;
      wrap_type: string;
      wrapped_key: string;
      verifier: string;
    };
    expect(payload.user_id).toBe("u1");
    expect(payload.wrap_type).toBe("default");
    // The row it wrote really is this key, wrapped with the public passphrase.
    expect(
      keyToB64(await unwrapMasterKey(payload.wrapped_key, DEFAULT_PASSPHRASE)),
    ).toBe(keyToB64(v.masterKey));

    // Mobile-only: the minted key is cached, so the next launch skips PBKDF2.
    expect(mockSecureStore.get(CACHED_KEY)).toBe(keyToB64(v.masterKey));
  });

  it("respects a row a race created during bootstrap (re-read wins)", async () => {
    const { mk, row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    // First read (no row) triggers bootstrap; the re-read finds the racer's row.
    let calls = 0;
    set({ "e2e_keys:select": () => ({ data: calls++ === 0 ? null : row }) });
    const v = await vault.loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status !== "unlocked") throw new Error("unreachable");
    // Prove it adopted the stored key, not its own orphaned one: a blob the
    // loaded key encrypts must decrypt under the racer's key.
    const blob = encryptString(v.masterKey, "x");
    expect(decryptString(mk, blob)).toBe("x");
    expect(v.mode).toBe("default");
    expect(mockSecureStore.get(CACHED_KEY)).toBe(keyToB64(mk));
  });

  it("loads an existing default-tier row unlocked, no upsert", async () => {
    const { mk, row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    set({ "e2e_keys:select": () => ({ data: row }) });
    const v = await vault.loadVault("u1");
    expect(v.status).toBe("unlocked");
    expect(opsOn("e2e_keys", "upsert")).toHaveLength(0);
    // One derivation, and the result is cached for next time.
    expect(unwrapSpy).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.get(CACHED_KEY)).toBe(keyToB64(mk));
  });

  it("uses a key cached on this device without deriving anything", async () => {
    // The whole point of the mobile design: a second launch costs a keystore
    // read and one AES-GCM verify, never 600k PBKDF2 rounds.
    const { mk, row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    mockSecureStore.set(CACHED_KEY, keyToB64(mk));
    set({ "e2e_keys:select": () => ({ data: row }) });

    const v = await vault.loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status !== "unlocked") throw new Error("unreachable");
    expect(keyToB64(v.masterKey)).toBe(keyToB64(mk));
    expect(unwrapSpy).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("unlocks a passphrase-tier vault from the cached key, keeping its mode", async () => {
    const { mk, row } = await keyRow("hunter2hunter", "passphrase");
    mockSecureStore.set(CACHED_KEY, keyToB64(mk));
    set({ "e2e_keys:select": () => ({ data: row }) });

    const v = await vault.loadVault("u1");
    expect(v).toEqual({ status: "unlocked", mode: "passphrase", masterKey: mk });
    expect(unwrapSpy).not.toHaveBeenCalled();
  });

  it("discards a cached key that fails the account's verifier and re-derives", async () => {
    // A key left behind by another account (or a reset vault) must never
    // silently decrypt into garbage.
    const { mk, row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    mockSecureStore.set(CACHED_KEY, keyToB64(generateMasterKey())); // foreign
    set({ "e2e_keys:select": () => ({ data: row }) });

    const v = await vault.loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status !== "unlocked") throw new Error("unreachable");
    expect(keyToB64(v.masterKey)).toBe(keyToB64(mk));
    expect(deleteItem).toHaveBeenCalledWith(CACHED_KEY); // stale — dropped
    expect(unwrapSpy).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.get(CACHED_KEY)).toBe(keyToB64(mk)); // replaced
  });

  it("ignores a cached value that isn't a 256-bit key", async () => {
    const { mk, row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    mockSecureStore.set(CACHED_KEY, keyToB64(new Uint8Array(16))); // wrong size
    set({ "e2e_keys:select": () => ({ data: row }) });

    const v = await vault.loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status !== "unlocked") throw new Error("unreachable");
    expect(keyToB64(v.masterKey)).toBe(keyToB64(mk));
    // Nothing usable was cached, so there was nothing to delete.
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("ignores a cached value that can't be decoded at all", async () => {
    const { mk, row } = await keyRow(DEFAULT_PASSPHRASE, "default");
    mockSecureStore.set(CACHED_KEY, "not-base64");
    fromB64Spy.mockImplementationOnce(() => {
      throw new Error("bad base64");
    });
    set({ "e2e_keys:select": () => ({ data: row }) });

    const v = await vault.loadVault("u1");
    expect(v.status).toBe("unlocked");
    if (v.status !== "unlocked") throw new Error("unreachable");
    expect(keyToB64(v.masterKey)).toBe(keyToB64(mk));
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("returns locked for a passphrase-tier row with no cached key", async () => {
    const { row } = await keyRow("hunter2hunter", "passphrase");
    set({ "e2e_keys:select": () => ({ data: row }) });
    expect(await vault.loadVault("u1")).toEqual({
      status: "locked",
      mode: "passphrase",
    });
    expect(mockSecureStore.has(CACHED_KEY)).toBe(false);
  });

  it("treats a row-shaped response with no data as no row", async () => {
    set({ "e2e_keys:select": () => ({}) }); // `data` absent entirely
    expect((await vault.loadVault("u1")).status).toBe("unlocked");
    expect(opsOn("e2e_keys", "upsert")).toHaveLength(1);
  });
});

describe("vault: unlockVault", () => {
  it("unlocks with the right passphrase; rejects wrong and missing", async () => {
    const { mk, row } = await keyRow("hunter2hunter", "passphrase");
    set({ "e2e_keys:select": () => ({ data: row }) });
    const key = await vault.unlockVault("u1", "hunter2hunter");
    expect(key).not.toBeNull();
    expect(keyToB64(key!)).toBe(keyToB64(mk));
    // Unlocking once is enough: the key is cached for later launches.
    expect(mockSecureStore.get(CACHED_KEY)).toBe(keyToB64(mk));

    expect(await vault.unlockVault("u1", "nope")).toBeNull();

    set({ "e2e_keys:select": () => ({ data: null }) });
    expect(await vault.unlockVault("u1", "hunter2hunter")).toBeNull();
  });

  it("rejects a right passphrase whose verifier doesn't match the key", async () => {
    const mk = generateMasterKey();
    const wrongKey = generateMasterKey();
    const row = {
      wrapped_key: await wrapMasterKey(mk, "pw"),
      wrap_type: "passphrase" as const,
      verifier: makeVerifier(wrongKey),
    };
    set({ "e2e_keys:select": () => ({ data: row }) });
    expect(await vault.unlockVault("u1", "pw")).toBeNull();
    expect(mockSecureStore.has(CACHED_KEY)).toBe(false);
  });
});

describe("vault: enable / disable a passphrase", () => {
  it("re-wraps the same master key instead of touching the data", async () => {
    const mk = generateMasterKey();
    set();
    await vault.enablePassphrase("u1", mk, "my passphrase");
    await vault.disablePassphrase("u1", mk);

    const updates = opsOn("e2e_keys", "update");
    expect(updates).toHaveLength(2);
    const [on, off] = updates.map(
      (c) => c.payload as { wrapped_key: string; wrap_type: E2EMode },
    );
    expect(on.wrap_type).toBe("passphrase");
    expect(keyToB64(await unwrapMasterKey(on.wrapped_key, "my passphrase"))).toBe(
      keyToB64(mk),
    );
    expect(off.wrap_type).toBe("default");
    expect(
      keyToB64(await unwrapMasterKey(off.wrapped_key, DEFAULT_PASSPHRASE)),
    ).toBe(keyToB64(mk));
  });
});

describe("vault: per-field encryption", () => {
  it("round-trips a transaction's money values, with and without a note", async () => {
    const mk = generateMasterKey();
    const withNote = await vault.encryptTxValues(mk, { ...SAMPLE, note: "rent" });
    // Each value is independently encrypted (and not stored in the clear).
    expect(withNote.amount_usd_cents_enc).not.toContain("12345");
    expect(await vault.rowToTransaction(txRow(withNote), mk)).toEqual({
      id: "t1",
      user_id: "u1",
      is_income: false,
      category: "food",
      original_currency: "USD",
      rate_used: 1,
      occurred_at: "2024-03-01T10:00:00Z",
      created_at: "2024-03-01T10:00:01Z",
      amount_usd_cents: 12345,
      original_amount: 123.45,
      note: "rent",
    });

    const noNote = await vault.encryptTxValues(mk, SAMPLE);
    expect(noNote.note_enc).toBeNull();
    expect((await vault.rowToTransaction(txRow(noNote), mk)).note).toBeNull();
    // An explicit null note is stored as null too, not as encrypted "null".
    expect((await vault.encryptTxValues(mk, { ...SAMPLE, note: null })).note_enc)
      .toBeNull();
  });

  it("round-trips a gold entry's money values, with and without a note", async () => {
    const mk = generateMasterKey();
    const withNote = await vault.encryptGoldValues(mk, {
      is_deposit: true,
      grams: 12.5,
      note: "wedding",
    });
    expect(await vault.rowToGold(goldRow(withNote), mk)).toEqual({
      id: "g1",
      user_id: "u1",
      is_deposit: true,
      occurred_at: "2024-03-01T10:00:00Z",
      created_at: "2024-03-01T10:00:01Z",
      grams: 12.5,
      note: "wedding",
    });

    const noNote = await vault.encryptGoldValues(mk, { is_deposit: false, grams: 1 });
    expect(noNote.note_enc).toBeNull();
    expect((await vault.rowToGold(goldRow(noNote), mk)).note).toBeNull();
  });

  it("reads legacy plaintext rows that haven't been backfilled yet", async () => {
    const mk = generateMasterKey();
    const tx = await vault.rowToTransaction(
      txRow({ amount_usd_cents: 500, original_amount: 5, note: "old" }),
      mk,
    );
    expect(tx.amount_usd_cents).toBe(500);
    expect(tx.original_amount).toBe(5);
    expect(tx.note).toBe("old");
    // A legacy row with no note at all reads as null, not undefined.
    const noNote = await vault.rowToTransaction(
      txRow({ amount_usd_cents: 1, original_amount: 1 }),
      mk,
    );
    expect(noNote.note).toBeNull();

    const gold = await vault.rowToGold(goldRow({ grams: 3.5, note: "old" }), mk);
    expect(gold.grams).toBe(3.5);
    expect(gold.note).toBe("old");
    expect((await vault.rowToGold(goldRow({ grams: 1 }), mk)).note).toBeNull();
  });
});
