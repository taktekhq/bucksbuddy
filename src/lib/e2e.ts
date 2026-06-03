// The encryption "vault": bridges the crypto primitives (lib/crypto) to the
// Supabase `e2e_keys` table and to transaction rows. Pure data layer — no React.
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_PASSPHRASE,
  checkVerifier,
  decryptString,
  encryptString,
  generateMasterKey,
  makeVerifier,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto";
import type { NewTransaction, Transaction } from "@/types/db";

export type E2EMode = "default" | "passphrase";

type KeyRow = { wrapped_key: string; wrap_type: E2EMode; verifier: string };

// The sensitive part of a transaction that gets encrypted into `ciphertext`.
// occurred_at / id / user_id / created_at stay plaintext (needed for ordering,
// identity and RLS, and they leak nothing about amount or category).
type TxSecret = Pick<
  Transaction,
  | "is_income"
  | "category"
  | "amount_usd_cents"
  | "original_currency"
  | "original_amount"
  | "rate_used"
  | "note"
>;

function secretOf(tx: NewTransaction | Transaction): TxSecret {
  return {
    is_income: tx.is_income,
    category: tx.category,
    amount_usd_cents: tx.amount_usd_cents,
    original_currency: tx.original_currency,
    original_amount: tx.original_amount,
    rate_used: tx.rate_used,
    note: tx.note ?? null,
  };
}

export function encryptTransaction(
  masterKey: CryptoKey,
  tx: NewTransaction | Transaction,
): Promise<string> {
  return encryptString(masterKey, JSON.stringify(secretOf(tx)));
}

export async function decryptTransaction(
  masterKey: CryptoKey,
  ciphertext: string,
): Promise<TxSecret> {
  return JSON.parse(await decryptString(masterKey, ciphertext)) as TxSecret;
}

async function fetchKeyRow(userId: string): Promise<KeyRow | null> {
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
export async function loadVault(userId: string): Promise<VaultState> {
  const row = await fetchKeyRow(userId);
  if (!row) {
    const masterKey = await generateMasterKey();
    await supabase.from("e2e_keys").insert({
      user_id: userId,
      wrapped_key: await wrapMasterKey(masterKey, DEFAULT_PASSPHRASE),
      wrap_type: "default",
      verifier: await makeVerifier(masterKey),
    });
    return { status: "unlocked", mode: "default", masterKey };
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
  userId: string,
  passphrase: string,
): Promise<CryptoKey | null> {
  const row = await fetchKeyRow(userId);
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
