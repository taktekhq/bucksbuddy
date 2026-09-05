// The encryption "vault" port — the seam between the store and whatever does
// the actual AES-GCM / PBKDF2 work.
//
// The PWA's lib/e2e.ts + lib/crypto.ts lean on WebCrypto, which Expo Go does
// not ship. This port keeps the store and every screen identical to the web
// while the crypto itself is swapped in last (a native build with WebCrypto,
// or a pure-JS implementation). Until then the Expo Go implementation below
// reports every account as *locked*: rows load with their plaintext labels and
// a garbled cipher fragment where the amount would be — exactly the state the
// web app shows on a device that hasn't been unlocked yet — and writes are
// refused with a clear message.
//
// To light up encryption: implement `Vault` for real (mirroring e2e.ts) and
// export it from here instead of `expoGoVault`. Nothing else changes.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import type {
  NewSafeGoldEntry,
  NewTransaction,
  SafeGoldEntry,
  SafeGoldEntryRow,
  Transaction,
  TransactionRow,
} from "@/types/db";

export type E2EMode = "default" | "passphrase";

// An opaque handle to the unlocked master key. The Expo Go vault never
// produces one; a real implementation stores a CryptoKey (or raw bytes) here.
export type MasterKey = { readonly __brand: "MasterKey" };

export type VaultState =
  | { status: "unlocked"; mode: E2EMode; masterKey: MasterKey }
  | { status: "locked"; mode: E2EMode };

export type TxEnc = {
  amount_usd_cents_enc: string;
  original_amount_enc: string;
  note_enc: string | null;
};
export type GoldEnc = { grams_enc: string; note_enc: string | null };

export type Vault = {
  /** Load (and, for a brand-new user, create) the vault. */
  loadVault(userId: string): Promise<VaultState>;
  /** Try a passphrase; the master key, or null when it's wrong. */
  unlockVault(userId: string, passphrase: string): Promise<MasterKey | null>;
  enablePassphrase(userId: string, key: MasterKey, passphrase: string): Promise<void>;
  disablePassphrase(userId: string, key: MasterKey): Promise<void>;
  rowToTransaction(row: TransactionRow, key: MasterKey): Promise<Transaction>;
  rowToGold(row: SafeGoldEntryRow, key: MasterKey): Promise<SafeGoldEntry>;
  encryptTxValues(key: MasterKey, tx: NewTransaction): Promise<TxEnc>;
  encryptGoldValues(key: MasterKey, entry: NewSafeGoldEntry): Promise<GoldEnc>;
  /** Human-readable reason writes are refused while locked. */
  lockedMessage: string;
};

// The passphrase is cached per-user on this device so it survives restarts and
// can be shown/edited in Settings — but it never leaves the device, so the
// server still can't read it (encryption stays end-to-end).
const PASS_KEY = (userId: string) => `bb-e2e-pass:${userId}`;

export async function loadStoredPassphrase(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PASS_KEY(userId));
  } catch {
    return null;
  }
}

export async function storeStoredPassphrase(userId: string, passphrase: string) {
  try {
    await AsyncStorage.setItem(PASS_KEY(userId), passphrase);
  } catch {
    // Storage unavailable — the passphrase just won't be remembered.
  }
}

export async function clearStoredPassphrase(userId: string) {
  try {
    await AsyncStorage.removeItem(PASS_KEY(userId));
  } catch {
    // Nothing to clear.
  }
}

// A stable, garbled stand-in for an encrypted value: a few characters of its
// ciphertext. Each row looks distinct but reveals nothing — used to show
// "obscured" data before a device is unlocked.
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

type KeyRow = { wrap_type: E2EMode };

// ---------------------------------------------------------------------------
// Expo Go implementation: no crypto available, so everything stays locked.
// It still reads the `e2e_keys` row so Settings can show whether the account
// has a passphrase turned on — that column is plaintext.
// ---------------------------------------------------------------------------
const NOT_AVAILABLE =
  "Decryption isn't available in Expo Go yet — it arrives with the native build.";

const notAvailable = () => Promise.reject(new Error(NOT_AVAILABLE));

export const expoGoVault: Vault = {
  lockedMessage: NOT_AVAILABLE,
  async loadVault(userId) {
    const { data } = await supabase
      .from("e2e_keys")
      .select("wrap_type")
      .eq("user_id", userId)
      .maybeSingle();
    const row = (data as KeyRow | null) ?? null;
    return { status: "locked", mode: row?.wrap_type ?? "default" };
  },
  async unlockVault() {
    return null;
  },
  enablePassphrase: notAvailable,
  disablePassphrase: notAvailable,
  rowToTransaction: notAvailable,
  rowToGold: notAvailable,
  encryptTxValues: notAvailable,
  encryptGoldValues: notAvailable,
};

export const vault: Vault = expoGoVault;
