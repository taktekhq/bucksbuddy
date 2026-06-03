/**
 * One-off backfill: encrypt existing plaintext money values into the `_enc`
 * columns added by 0003/0004. Reuses the app's real crypto so the format
 * matches exactly. Leaves the original columns untouched so you can verify
 * before running 0005_drop_plaintext_values.sql.
 *
 * Why a script and not pure SQL: the encryption key never lives on the server,
 * so Postgres can't produce the ciphertext. This runs with the key in hand.
 *
 * Usage (needs the service-role key so it can read every user's rows):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/encrypt-backfill.ts
 *
 * Idempotent: it only touches rows whose `_enc` columns are still null, so it's
 * safe to re-run. Rows belonging to users who've already set a passphrase are
 * skipped — only their own browser can encrypt those, which it does as they use
 * the app.
 */
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_PASSPHRASE,
  encryptString,
  generateMasterKey,
  makeVerifier,
  unwrapMasterKey,
  wrapMasterKey,
} from "../src/lib/crypto";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const encNumber = (key: CryptoKey, n: number) => encryptString(key, String(n));
const encNote = (key: CryptoKey, note: string | null) =>
  note === null ? Promise.resolve(null) : encryptString(key, note);

// Each user has their own master key. At rollout everyone is default-tier, so we
// can unwrap it with the public passphrase (and bootstrap the vault row if the
// app hasn't created it yet). Cached per user.
const keyCache = new Map<string, CryptoKey | null>();

async function fetchKeyRow(userId: string) {
  const { data, error } = await db
    .from("e2e_keys")
    .select("wrapped_key, wrap_type")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function masterKeyFor(userId: string): Promise<CryptoKey | null> {
  const cached = keyCache.get(userId);
  if (cached !== undefined) return cached;

  let row = await fetchKeyRow(userId);
  if (!row) {
    const mk = await generateMasterKey();
    // Idempotent: ignoreDuplicates so we never clobber a row the app created
    // (which could be passphrase-wrapped) if we race with it.
    const { error: upErr } = await db.from("e2e_keys").upsert(
      {
        user_id: userId,
        wrapped_key: await wrapMasterKey(mk, DEFAULT_PASSPHRASE),
        wrap_type: "default",
        verifier: await makeVerifier(mk),
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
    if (upErr) throw upErr;
    row = await fetchKeyRow(userId);
    if (!row) {
      keyCache.set(userId, mk);
      return mk;
    }
  }

  // Respect the stored row (ours, or whoever won the race). Passphrase-tier
  // rows aren't ours to encrypt.
  const key =
    row.wrap_type === "default"
      ? await unwrapMasterKey(row.wrapped_key, DEFAULT_PASSPHRASE)
      : null;
  keyCache.set(userId, key);
  return key;
}

async function backfillTransactions() {
  const { data, error } = await db
    .from("transactions")
    .select("id, user_id, amount_usd_cents, original_amount, note")
    .is("amount_usd_cents_enc", null)
    .not("amount_usd_cents", "is", null);
  if (error) throw error;

  let done = 0;
  let skipped = 0;
  for (const r of data ?? []) {
    const key = await masterKeyFor(r.user_id);
    if (!key) {
      skipped++;
      continue;
    }
    const { error: upErr } = await db
      .from("transactions")
      .update({
        amount_usd_cents_enc: await encNumber(key, r.amount_usd_cents),
        original_amount_enc: await encNumber(key, r.original_amount),
        note_enc: await encNote(key, r.note),
      })
      .eq("id", r.id);
    if (upErr) throw upErr;
    done++;
  }
  return { done, skipped };
}

async function backfillGold() {
  const { data, error } = await db
    .from("safe_gold_entries")
    .select("id, user_id, grams, note")
    .is("grams_enc", null)
    .not("grams", "is", null);
  if (error) throw error;

  let done = 0;
  let skipped = 0;
  for (const r of data ?? []) {
    const key = await masterKeyFor(r.user_id);
    if (!key) {
      skipped++;
      continue;
    }
    const { error: upErr } = await db
      .from("safe_gold_entries")
      .update({
        grams_enc: await encNumber(key, r.grams),
        note_enc: await encNote(key, r.note),
      })
      .eq("id", r.id);
    if (upErr) throw upErr;
    done++;
  }
  return { done, skipped };
}

async function main() {
  const tx = await backfillTransactions();
  const gold = await backfillGold();
  console.log(
    `transactions: encrypted ${tx.done}, skipped ${tx.skipped} (passphrase-tier)`,
  );
  console.log(
    `gold:         encrypted ${gold.done}, skipped ${gold.skipped} (passphrase-tier)`,
  );
  console.log(
    "\nVerify both 'still missing _enc' counts are 0 (see 0005_drop_plaintext_values.sql),",
  );
  console.log("then run that migration to drop the plaintext columns.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
