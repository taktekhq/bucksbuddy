// The encryption "vault": bridges the crypto primitives (./crypto) to the
// Supabase `e2e_keys` table and to the per-field encrypted columns. Pure data
// layer — no React. `supabase` and `storage` are passed in rather than
// imported, exactly like crypto.ts's CryptoPort: each shell supplies its own
// client and its own StoragePort (localStorage on web, AsyncStorage on
// native), so this file has no idea which platform it's running on.
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_PASSPHRASE,
  checkVerifier,
  decryptString,
  encryptString,
  generateMasterKey,
  makeVerifier,
  unwrapMasterKey,
  wrapMasterKey,
} from "./crypto.js";
import type { StoragePort } from "./storagePort.js";

export type E2EMode = "default" | "passphrase";

type KeyRow = { wrapped_key: string; wrap_type: E2EMode; verifier: string };

// The passphrase is cached per-user on this device so it survives restarts and
// can be shown/edited in Settings — but it never leaves the device, so the
// server still can't read it (encryption stays end-to-end).
const PASS_KEY = (userId: string) => `bb-e2e-pass:${userId}`;

export async function loadStoredPassphrase(storage: StoragePort, userId: string): Promise<string | null> {
  return storage.get(PASS_KEY(userId));
}

export async function storeStoredPassphrase(
  storage: StoragePort,
  userId: string,
  passphrase: string,
): Promise<void> {
  await storage.set(PASS_KEY(userId), passphrase);
}

export async function clearStoredPassphrase(storage: StoragePort, userId: string): Promise<void> {
  await storage.remove(PASS_KEY(userId));
}

// A stable, garbled stand-in for an encrypted value: a few characters of its
// ciphertext. Each row looks distinct but reveals nothing — used to show
// "obscured" data before a device is unlocked.
export function cipherMask(cipher: string | null): string {
  const frag = (cipher ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4);
  return frag || "••••";
}

// We encrypt only the money *values* (and free-text notes); the labels
// (category, direction, currency, rate, date) stay as plaintext columns. Each
// value goes into its own `_enc` column, so the schema keeps a clean 1:1 shape.
function encNumber(masterKey: CryptoKey, n: number): Promise<string> {
  return encryptString(masterKey, String(n));
}

async function decNumber(masterKey: CryptoKey, cipher: string): Promise<number> {
  return Number(await decryptString(masterKey, cipher));
}

function encNote(masterKey: CryptoKey, note: string | null | undefined): Promise<string | null> {
  if (note === null || note === undefined) return Promise.resolve(null);
  return encryptString(masterKey, note);
}

// --- transactions: amount_usd_cents / original_amount / note ---
export type TxPlain = {
  amount_usd_cents: number;
  original_amount: number;
  note?: string | null;
};
export type TxEnc = {
  amount_usd_cents_enc: string;
  original_amount_enc: string;
  note_enc: string | null;
};

export async function encryptTxValues(masterKey: CryptoKey, tx: TxPlain): Promise<TxEnc> {
  return {
    amount_usd_cents_enc: await encNumber(masterKey, tx.amount_usd_cents),
    original_amount_enc: await encNumber(masterKey, tx.original_amount),
    note_enc: await encNote(masterKey, tx.note),
  };
}

export async function decryptTxValues(
  masterKey: CryptoKey,
  row: TxEnc,
): Promise<{ amount_usd_cents: number; original_amount: number; note: string | null }> {
  return {
    amount_usd_cents: await decNumber(masterKey, row.amount_usd_cents_enc),
    original_amount: await decNumber(masterKey, row.original_amount_enc),
    note: row.note_enc === null ? null : await decryptString(masterKey, row.note_enc),
  };
}

// --- gold: grams / note ---
export type GoldPlain = { grams: number; note?: string | null };
export type GoldEnc = { grams_enc: string; note_enc: string | null };

export async function encryptGoldValues(masterKey: CryptoKey, entry: GoldPlain): Promise<GoldEnc> {
  return {
    grams_enc: await encNumber(masterKey, entry.grams),
    note_enc: await encNote(masterKey, entry.note),
  };
}

export async function decryptGoldValues(
  masterKey: CryptoKey,
  row: GoldEnc,
): Promise<{ grams: number; note: string | null }> {
  return {
    grams: await decNumber(masterKey, row.grams_enc),
    note: row.note_enc === null ? null : await decryptString(masterKey, row.note_enc),
  };
}

async function fetchKeyRow(supabase: SupabaseClient, userId: string): Promise<KeyRow | null> {
  const { data } = await supabase
    .from("e2e_keys")
    .select("wrapped_key, wrap_type, verifier")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as KeyRow | null) ?? null;
}

export type VaultState =
  | { status: "unlocked"; mode: E2EMode; masterKey: CryptoKey }
  | { status: "locked" };

// Load (and, for a brand-new user, create) the vault. Default-tier users are
// unlocked transparently with the public passphrase; passphrase-tier users come
// back "locked" until they enter their passphrase.
export async function loadVault(supabase: SupabaseClient, userId: string): Promise<VaultState> {
  let row = await fetchKeyRow(supabase, userId);
  if (!row) {
    const masterKey = await generateMasterKey();
    // Idempotent create: `ignoreDuplicates` means we never clobber an existing
    // row (e.g. a passphrase-wrapped key), so this is safe even if the app and
    // the backfill script both try to bootstrap the same user at once.
    await supabase.from("e2e_keys").upsert(
      {
        user_id: userId,
        wrapped_key: await wrapMasterKey(masterKey, DEFAULT_PASSPHRASE),
        wrap_type: "default",
        verifier: await makeVerifier(masterKey),
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
    // Re-read: normally returns the row we just wrote; under a race it returns
    // whoever won — which we must respect instead of our now-orphaned key.
    row = await fetchKeyRow(supabase, userId);
    if (!row) return { status: "unlocked", mode: "default", masterKey };
  }
  if (row.wrap_type === "default") {
    const masterKey = await unwrapMasterKey(row.wrapped_key, DEFAULT_PASSPHRASE);
    return { status: "unlocked", mode: "default", masterKey };
  }
  return { status: "locked" };
}

// Try to unlock a passphrase-tier vault. Returns the master key, or null if the
// passphrase is wrong (or there's somehow no row).
export async function unlockVault(
  supabase: SupabaseClient,
  userId: string,
  passphrase: string,
): Promise<CryptoKey | null> {
  const row = await fetchKeyRow(supabase, userId);
  // Stryker disable next-line ConditionalExpression : equivalent — without this
  // guard the property read below throws into the catch, returning null just
  // the same.
  if (!row) return null;
  try {
    const masterKey = await unwrapMasterKey(row.wrapped_key, passphrase);
    return (await checkVerifier(masterKey, row.verifier)) ? masterKey : null;
  } catch {
    return null;
  }
}

// Turn on E2E: re-wrap the (already known) master key under the user's
// passphrase. Cheap — the data is untouched.
export async function enablePassphrase(
  supabase: SupabaseClient,
  userId: string,
  masterKey: CryptoKey,
  passphrase: string,
): Promise<void> {
  await supabase
    .from("e2e_keys")
    .update({
      wrapped_key: await wrapMasterKey(masterKey, passphrase),
      wrap_type: "passphrase",
    })
    .eq("user_id", userId);
}

// Turn off E2E: re-wrap the master key back under the public passphrase. The
// data becomes operator-readable again, same as the default tier.
export async function disablePassphrase(
  supabase: SupabaseClient,
  userId: string,
  masterKey: CryptoKey,
): Promise<void> {
  await supabase
    .from("e2e_keys")
    .update({
      wrapped_key: await wrapMasterKey(masterKey, DEFAULT_PASSPHRASE),
      wrap_type: "default",
    })
    .eq("user_id", userId);
}
