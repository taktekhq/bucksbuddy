// Community numbers for the Stats page, via the public_stats() rpc (see
// supabase/migrations/0006_public_stats.sql). Anyone can call it — including
// signed-out visitors on the anon key. Counts only: amounts are encrypted, so
// there is nothing money-shaped the server could aggregate even if it wanted.
// Degrades silently to null (like lib/gold.ts) so the section can show a
// quiet fallback instead of breaking the page.

import { supabase } from "@/lib/supabase";

export type PublicCategoryCount = { category: string; count: number };

export type PublicStats = {
  users: number;
  transactions: number;
  encryptedUsers: number;
  topCategories: PublicCategoryCount[];
};

/** A non-negative finite count, or null when the payload is junk. */
function toCount(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function fetchPublicStats(): Promise<PublicStats | null> {
  try {
    const { data, error } = await supabase.rpc("public_stats");
    if (error || data == null || typeof data !== "object") return null;
    const blob = data as Record<string, unknown>;

    const users = toCount(blob.users);
    const transactions = toCount(blob.transactions);
    const encryptedUsers = toCount(blob.encrypted_users);
    if (users === null || transactions === null || encryptedUsers === null) {
      return null;
    }

    const topCategories: PublicCategoryCount[] = [];
    for (const entry of Array.isArray(blob.top_categories) ? blob.top_categories : []) {
      const category = (entry as Record<string, unknown> | null)?.category;
      const count = toCount((entry as Record<string, unknown> | null)?.count);
      if (typeof category !== "string" || count === null) return null;
      topCategories.push({ category, count });
    }

    return { users, transactions, encryptedUsers, topCategories };
  } catch {
    return null;
  }
}
