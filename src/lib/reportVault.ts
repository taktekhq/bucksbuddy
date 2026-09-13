// The passphrase that gates the spending-review archive.
//
// Reviews are kept so a second and a tenth one can be read later, not just the
// newest. A review is also the most *legible* thing in the app — rows of numbers
// versus a few hundred words about someone's money — so the archive sits behind
// its own passphrase, held in the database as an unreadable token.
//
// What this is, precisely, so the README can be honest about it:
//   * It IS a lock on the archive. The passphrase is never stored, never sent,
//     and cannot be recovered from the row; the app checks it by trying to
//     unwrap a random token with it (AES-GCM authentication fails on a wrong
//     one). It is deliberately NOT cached on the device — unlike the encryption
//     passphrase, which gates every screen and so has to be — so a borrowed,
//     unlocked phone does not come with the archive open.
//   * It is NOT a second layer of encryption over the review. A review's body is
//     encrypted with the same master key as every amount in the account, so its
//     confidentiality is exactly that of the user's own tier (see the Encryption
//     section of the README): operator-readable by default, end-to-end once a
//     personal passphrase is on. Protecting the summary more strongly than the
//     numbers it is drawn from would be an odd boundary to claim.
//   * Forgetting it loses nothing. It can be replaced from any unlocked device,
//     because the reviews were never encrypted under it.

import { supabase } from "@/lib/supabase";
import { generateMasterKey, unwrapMasterKey, wrapMasterKey } from "@/lib/crypto";

type AccessRow = { verifier: string };

/** True when this account has set an archive passphrase. */
export async function hasReviewPassphrase(userId: string): Promise<boolean> {
  return (await fetchAccess(userId)) !== null;
}

async function fetchAccess(userId: string): Promise<AccessRow | null> {
  const { data } = await supabase
    .from("review_access")
    .select("verifier")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as AccessRow | null) ?? null;
}

// The stored token is a random AES key wrapped under the passphrase. The key
// itself is never used for anything — wrapping is just the cheapest honest way
// to hold "this passphrase and no other" without holding the passphrase.
function makeToken(passphrase: string): Promise<string> {
  return generateMasterKey().then((key) => wrapMasterKey(key, passphrase));
}

/** Set or replace the archive passphrase. Reviews are unaffected either way. */
export async function setReviewPassphrase(
  userId: string,
  passphrase: string,
): Promise<{ error: string | null }> {
  const verifier = await makeToken(passphrase);
  const { error } = await supabase
    .from("review_access")
    .upsert({ user_id: userId, verifier }, { onConflict: "user_id" });
  return { error: error?.message ?? null };
}

/** Check a passphrase against the stored token. */
export async function checkReviewPassphrase(
  userId: string,
  passphrase: string,
): Promise<boolean> {
  const row = await fetchAccess(userId);
  if (!row) return false;
  try {
    await unwrapMasterKey(row.verifier, passphrase);
    return true;
  } catch {
    // A wrong passphrase and a corrupt token are indistinguishable here, and
    // both mean the same thing to the caller.
    return false;
  }
}
