import { supabase } from "./supabase";
import { currentMonthRange } from "./dates";
import type { Transaction, TransactionRow } from "@/types/db";

// Never use the capped store/cache. Exact counts plus ID deduplication fail
// closed if pagination shifts during a write. RLS and user_id both scope reads.
export async function fetchRecapMonth(
  userId: string,
  month: Date,
  decrypt: (row: TransactionRow) => Promise<Transaction>,
  signal: AbortSignal,
): Promise<Transaction[]> {
  const { from, to } = currentMonthRange(month);
  const rows = new Map<string, Transaction>();
  let offset = 0;
  let expected: number | null = null;
  do {
    signal.throwIfAborted();
    const { data, error, count } = await supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .gte("occurred_at", from.toISOString())
      .lt("occurred_at", to.toISOString())
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 499)
      .abortSignal(signal);
    signal.throwIfAborted();
    if (
      error ||
      !data ||
      count === null ||
      (expected !== null && count !== expected)
    )
      throw new Error("incomplete_query");
    expected = count;
    if (data.length === 0 && offset < expected)
      throw new Error("incomplete_query");
    for (const row of data as TransactionRow[]) {
      if (!rows.has(row.id)) rows.set(row.id, await decrypt(row));
    }
    offset += data.length;
  } while (offset < expected);
  signal.throwIfAborted();
  if (rows.size !== expected) throw new Error("incomplete_query");
  return [...rows.values()];
}
