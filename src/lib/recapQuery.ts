// Every transaction of one local calendar month, fetched fresh from the
// database and decrypted through the vault — never read off the store's
// capped, newest-500 window or the on-device snapshot. A Recap is only worth
// sharing if it's complete, so this pages in a stable order with an exact
// count, de-duplicates by id, and refuses to hand back anything short of the
// whole month.
import { supabase } from "@/lib/supabase";
import { currentMonthRange } from "@/lib/dates";
import type { Transaction, TransactionRow } from "@/types/db";

/** Rows per request; well under PostgREST's default 1000-row ceiling. */
export const PAGE_SIZE = 500;

export type RecapLoadKind = "locked" | "incomplete";

// Why a month couldn't be loaded, in terms the screen can act on: "locked"
// (this device can't decrypt yet — unlock in Settings) or "incomplete" (the
// query failed, came back short, or the rows moved under us — retry).
export class RecapLoadError extends Error {
  readonly kind: RecapLoadKind;
  constructor(kind: RecapLoadKind) {
    super(kind);
    this.name = "RecapLoadError";
    this.kind = kind;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Recap load aborted", "AbortError");
}

/**
 * Fetch and decrypt the whole month containing `month`. `decrypt` turns a
 * stored row into a plaintext Transaction (the store provides it, since it
 * holds the key). Rejects with an AbortError once `signal` aborts, and with
 * a RecapLoadError("incomplete") when the result can't be trusted.
 */
export async function fetchMonthRows(
  userId: string,
  month: Date,
  decrypt: (row: TransactionRow) => Promise<Transaction>,
  signal?: AbortSignal,
): Promise<Transaction[]> {
  const { from, to } = currentMonthRange(month);
  const byId = new Map<string, Transaction>();
  let offset = 0;
  let expected: number | null = null;
  for (;;) {
    throwIfAborted(signal);
    const query = supabase
      .from("transactions")
      .select("*", { count: "exact" })
      // RLS already scopes reads to the signed-in user; the filter is belt
      // and braces so a policy slip can't leak another account into a card.
      .eq("user_id", userId)
      .gte("occurred_at", from.toISOString())
      .lt("occurred_at", to.toISOString())
      // A total order (time, then id) keeps the pages from overlapping.
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    const { data, error, count } = await (signal ? query.abortSignal(signal) : query);
    // An abort surfaces as a query error; report it as the cancellation it is.
    throwIfAborted(signal);
    if (error || !data || count === null || count === undefined) {
      throw new RecapLoadError("incomplete");
    }
    // The count is re-checked on every page: if it moved (an entry added or
    // deleted mid-fetch) the pages no longer line up, so start over on retry.
    if (expected !== null && count !== expected) throw new RecapLoadError("incomplete");
    expected = count;
    const rows = data as TransactionRow[];
    for (const row of rows) {
      if (!byId.has(row.id)) byId.set(row.id, await decrypt(row));
    }
    offset += rows.length;
    if (offset >= expected) break;
    // The server promised more rows than it gave — don't loop forever on it.
    if (rows.length === 0) throw new RecapLoadError("incomplete");
  }
  throwIfAborted(signal);
  if (byId.size !== expected) throw new RecapLoadError("incomplete");
  return [...byId.values()];
}
