// The encryption "vault": bridges the crypto primitives (lib/crypto) to the
// Supabase `e2e_keys` table and to the per-field encrypted columns. Pure data
// layer — no React. The native counterpart of the web's ../src/lib/e2e.ts.
//
// WHY THIS DIFFERS FROM THE WEB, AND IT MATTERS FOR SPEED
//
// The web derives a wrapping key from a passphrase on every page load: 600k
// PBKDF2 rounds, which WebCrypto does in native code in a few hundred
// milliseconds. In React Native the same work is pure JavaScript and takes
// seconds, so doing it on every launch would make the app unusable.
//
// It also isn't necessary. A user's master key never changes: it is generated
// once, and turning a passphrase on or off only re-wraps it (see the web's
// e2e.ts — `generateMasterKey` is called exactly once, at bootstrap). So this
// device derives the key ONCE, then keeps the unwrapped key in the OS keystore
// (iOS Keychain / Android Keystore, hardware-backed and only readable once the
// device has been unlocked). Every later launch is a keystore read: no PBKDF2,
// no perceptible delay.
//
// That is also a privacy improvement on the web, which caches the passphrase
// itself in localStorage in plaintext. Here the passphrase — kept only so
// Settings can show it back, exactly as the web does — sits in the keystore
// too, and both are wiped on sign-out and account deletion.
//
// The cached key is checked against the account's verifier on load, so a stale
// key (or one from another account) can never silently decrypt into garbage.
import * as SecureStore from "expo-secure-store";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_PASSPHRASE,
  checkVerifier,
  decryptString,
  encryptString,
  generateMasterKey,
  keyFromB64,
  keyToB64,
  makeVerifier,
  unwrapMasterKey,
  wrapMasterKey,
  type MasterKeyBytes,
} from "@/lib/crypto";
import type {
  NewSafeGoldEntry,
  NewTransaction,
  SafeGoldEntry,
  SafeGoldEntryRow,
  Transaction,
  TransactionRow,
} from "@/types/db";

export type E2EMode = "default" | "passphrase";

/** The unlocked master key for this session. */
export type MasterKey = MasterKeyBytes;

export type VaultState =
  | { status: "unlocked"; mode: E2EMode; masterKey: MasterKey }
  | { status: "locked"; mode: E2EMode };

type KeyRow = { wrapped_key: string; wrap_type: E2EMode; verifier: string };

export const LOCKED_MSG = "Locked — unlock with your passphrase first.";

// --- device storage -------------------------------------------------------
// SecureStore keys may only contain alphanumerics, ".", "-" and "_", so the
// user id (a uuid) is fine but the ":" the web uses is not.
const PASS_KEY = (userId: string) => `bb-e2e-pass_${userId}`;
const CACHED_KEY = (userId: string) => `bb-e2e-key_${userId}`;

async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // No keystore (or the device was never unlocked) — behave as if empty.
    return null;
  }
}

async function writeSecure(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, {
      // Readable only after the device has been unlocked once since boot, and
      // never migrated to a new device via a backup.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Storage unavailable — the secret just won't be remembered; the next
    // launch derives it again.
  }
}

async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing to clear.
  }
}

/** The passphrase cached on this device, so Settings can show and edit it.
 *  It never leaves the device, so encryption stays end-to-end. */
export function loadStoredPassphrase(userId: string): Promise<string | null> {
  return readSecure(PASS_KEY(userId));
}

export function storeStoredPassphrase(userId: string, passphrase: string): Promise<void> {
  return writeSecure(PASS_KEY(userId), passphrase);
}

/** Wipe every secret this device holds for the user — sign-out, account
 *  deletion, or a cached key that turned out to be stale. */
export async function clearDeviceSecrets(userId: string): Promise<void> {
  await Promise.all([deleteSecure(PASS_KEY(userId)), deleteSecure(CACHED_KEY(userId))]);
}

async function loadCachedKey(userId: string): Promise<MasterKey | null> {
  const b64 = await readSecure(CACHED_KEY(userId));
  if (!b64) return null;
  try {
    const key = keyFromB64(b64);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

function cacheKey(userId: string, key: MasterKey): Promise<void> {
  return writeSecure(CACHED_KEY(userId), keyToB64(key));
}

// --- masking (locked device) ---------------------------------------------

/** A stable, garbled stand-in for an encrypted value: a few characters of its
 *  ciphertext. Each row looks distinct but reveals nothing. */
export function cipherMask(cipher: string | null): string {
  const frag = (cipher ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4);
  return frag || "••••";
}

// Locked-device renderings: keep the plaintext labels, but show the amount as a
// garbled stand-in (so the screen looks alive, not walled off) until unlocked.
export function maskedTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    user_id: row.user_id,
    is_income: row.is_income,
    category: row.category,
    original_currency: row.original_currency,
    rate_used: row.rate_used,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    amount_usd_cents: 0,
    original_amount: 0,
    note: null,
    amountMask: cipherMask(row.amount_usd_cents_enc),
  };
}

export function maskedGold(row: SafeGoldEntryRow): SafeGoldEntry {
  return {
    id: row.id,
    user_id: row.user_id,
    is_deposit: row.is_deposit,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    grams: 0,
    note: null,
    gramsMask: cipherMask(row.grams_enc),
  };
}

// --- per-field encryption -------------------------------------------------
// We encrypt only the money *values* (and free-text notes); the labels
// (category, direction, currency, rate, date) stay as plaintext columns.
export type TxEnc = {
  amount_usd_cents_enc: string;
  original_amount_enc: string;
  note_enc: string | null;
};
export type GoldEnc = { grams_enc: string; note_enc: string | null };

const encNumber = (key: MasterKey, n: number) => encryptString(key, String(n));
const decNumber = (key: MasterKey, c: string) => Number(decryptString(key, c));
const encNote = (key: MasterKey, note: string | null | undefined) =>
  note === null || note === undefined ? null : encryptString(key, note);

async function fetchKeyRow(userId: string): Promise<KeyRow | null> {
  const { data } = await supabase
    .from("e2e_keys")
    .select("wrapped_key, wrap_type, verifier")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as KeyRow | null) ?? null;
}

export type Vault = {
  loadVault(userId: string): Promise<VaultState>;
  unlockVault(userId: string, passphrase: string): Promise<MasterKey | null>;
  enablePassphrase(userId: string, key: MasterKey, passphrase: string): Promise<void>;
  disablePassphrase(userId: string, key: MasterKey): Promise<void>;
  rowToTransaction(row: TransactionRow, key: MasterKey): Promise<Transaction>;
  rowToGold(row: SafeGoldEntryRow, key: MasterKey): Promise<SafeGoldEntry>;
  encryptTxValues(key: MasterKey, tx: NewTransaction): Promise<TxEnc>;
  encryptGoldValues(key: MasterKey, entry: NewSafeGoldEntry): Promise<GoldEnc>;
  lockedMessage: string;
};

export const vault: Vault = {
  lockedMessage: LOCKED_MSG,

  // Load (and, for a brand-new user, create) the vault. The fast path — a key
  // already cached on this device — costs one keystore read and one AES-GCM
  // verify; only a first unlock on a device pays for PBKDF2.
  async loadVault(userId) {
    let row = await fetchKeyRow(userId);

    if (!row) {
      // Brand-new user: mint a master key and wrap it with the public
      // passphrase. Idempotent — `ignoreDuplicates` means we never clobber an
      // existing row, so this is safe even if two clients race.
      const masterKey = generateMasterKey();
      await supabase.from("e2e_keys").upsert(
        {
          user_id: userId,
          wrapped_key: await wrapMasterKey(masterKey, DEFAULT_PASSPHRASE),
          wrap_type: "default",
          verifier: makeVerifier(masterKey),
        },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
      // Re-read: normally our own row, but under a race it's whoever won,
      // which we must respect instead of our now-orphaned key.
      row = await fetchKeyRow(userId);
      if (!row) {
        await cacheKey(userId, masterKey);
        return { status: "unlocked", mode: "default", masterKey };
      }
    }

    // Fast path: a key this device already unwrapped, checked against the
    // account's verifier so a stale or foreign key can't slip through.
    const cached = await loadCachedKey(userId);
    if (cached && checkVerifier(cached, row.verifier)) {
      return { status: "unlocked", mode: row.wrap_type, masterKey: cached };
    }
    if (cached) await deleteSecure(CACHED_KEY(userId)); // stale — drop it

    if (row.wrap_type === "default") {
      // No user passphrase: the wrapper is public, so we can always open it.
      // Costs one derivation, once per device.
      const masterKey = await unwrapMasterKey(row.wrapped_key, DEFAULT_PASSPHRASE);
      await cacheKey(userId, masterKey);
      return { status: "unlocked", mode: "default", masterKey };
    }
    return { status: "locked", mode: "passphrase" };
  },

  // Try to unlock a passphrase-tier vault. Returns the master key, or null if
  // the passphrase is wrong (or there's somehow no row).
  async unlockVault(userId, passphrase) {
    const row = await fetchKeyRow(userId);
    if (!row) return null;
    try {
      const masterKey = await unwrapMasterKey(row.wrapped_key, passphrase);
      if (!checkVerifier(masterKey, row.verifier)) return null;
      await cacheKey(userId, masterKey);
      return masterKey;
    } catch {
      return null;
    }
  },

  // Turn on E2E: re-wrap the (already known) master key under the user's
  // passphrase. Cheap — the data is untouched, and the cached key stays valid
  // because the master key itself doesn't change.
  async enablePassphrase(userId, masterKey, passphrase) {
    await supabase
      .from("e2e_keys")
      .update({
        wrapped_key: await wrapMasterKey(masterKey, passphrase),
        wrap_type: "passphrase",
      })
      .eq("user_id", userId);
  },

  // Turn off E2E: re-wrap the master key back under the public passphrase. The
  // data becomes operator-readable again, same as the default tier.
  async disablePassphrase(userId, masterKey) {
    await supabase
      .from("e2e_keys")
      .update({
        wrapped_key: await wrapMasterKey(masterKey, DEFAULT_PASSPHRASE),
        wrap_type: "default",
      })
      .eq("user_id", userId);
  },

  // Turn a stored row into a decrypted Transaction. The labels are plaintext;
  // the money values come from the `_enc` columns, or — for rows not yet
  // backfilled — from the legacy plaintext columns.
  async rowToTransaction(row, key) {
    const values = row.amount_usd_cents_enc
      ? {
          amount_usd_cents: decNumber(key, row.amount_usd_cents_enc),
          original_amount: decNumber(key, row.original_amount_enc!),
          note: row.note_enc === null ? null : decryptString(key, row.note_enc),
        }
      : {
          amount_usd_cents: row.amount_usd_cents!,
          original_amount: row.original_amount!,
          note: row.note ?? null,
        };
    return {
      id: row.id,
      user_id: row.user_id,
      is_income: row.is_income,
      category: row.category,
      original_currency: row.original_currency,
      rate_used: row.rate_used,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      ...values,
    };
  },

  async rowToGold(row, key) {
    const values = row.grams_enc
      ? {
          grams: decNumber(key, row.grams_enc),
          note: row.note_enc === null ? null : decryptString(key, row.note_enc),
        }
      : { grams: row.grams!, note: row.note ?? null };
    return {
      id: row.id,
      user_id: row.user_id,
      is_deposit: row.is_deposit,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      ...values,
    };
  },

  async encryptTxValues(key, tx) {
    return {
      amount_usd_cents_enc: encNumber(key, tx.amount_usd_cents),
      original_amount_enc: encNumber(key, tx.original_amount),
      note_enc: encNote(key, tx.note),
    };
  },

  async encryptGoldValues(key, entry) {
    return {
      grams_enc: encNumber(key, entry.grams),
      note_enc: encNote(key, entry.note),
    };
  },
};
