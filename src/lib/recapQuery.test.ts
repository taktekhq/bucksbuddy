import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type Handler, type QueryResult } from "@/test/supabaseMock";
import type { Transaction, TransactionRow } from "@/types/db";

// A swappable supabase mock: each test sets `mock` before calling in. The
// builder's `abortSignal` is wrapped so a test can tell whether the query was
// tied to a signal at all (the no-signal path must never call it).
let mock = makeSupabaseMock();
const abortSignals = vi.hoisted(() => [] as AbortSignal[]);
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const builder = mock.supabase.from(table) as Record<string, unknown>;
      const original = builder.abortSignal as (s: AbortSignal) => unknown;
      builder.abortSignal = (s: AbortSignal) => {
        abortSignals.push(s);
        return original(s);
      };
      return builder;
    },
  },
}));

import { fetchMonthRows, PAGE_SIZE, RecapLoadError } from "@/lib/recapQuery";

const month = new Date(2026, 5, 10, 12);

function row(id: string): TransactionRow {
  return {
    id,
    user_id: "u1",
    occurred_at: new Date(2026, 5, 10, 12).toISOString(),
    created_at: new Date(2026, 5, 10, 12).toISOString(),
    is_income: false,
    category: "groceries",
    original_currency: "USD",
    rate_used: 1,
    amount_usd_cents_enc: "enc",
    original_amount_enc: "enc",
    note_enc: null,
  };
}

function rows(from: number, to: number): TransactionRow[] {
  return Array.from({ length: to - from }, (_, i) => row(`t${from + i}`));
}

// Decrypt stands in for the store's vault: the plaintext just echoes the id so
// order and de-duplication can be read straight off the result.
function makeDecrypt() {
  return vi.fn(
    async (r: TransactionRow): Promise<Transaction> => ({
      id: r.id,
      user_id: r.user_id,
      is_income: r.is_income,
      category: r.category,
      amount_usd_cents: 100,
      original_currency: r.original_currency,
      original_amount: 1,
      rate_used: r.rate_used,
      occurred_at: r.occurred_at,
      note: null,
      created_at: r.created_at,
    }),
  );
}

// Serve a different page per request, in order; the last one repeats if the
// code under test asks for more than the test planned for.
function pages(...results: QueryResult[]): Handler {
  let i = 0;
  return () => results[Math.min(i++, results.length - 1)];
}

function setup(handler: Handler) {
  mock = makeSupabaseMock({ "transactions:select": handler });
  return mock;
}

async function expectIncomplete(promise: Promise<unknown>) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(RecapLoadError);
  expect((err as RecapLoadError).kind).toBe("incomplete");
  expect((err as RecapLoadError).name).toBe("RecapLoadError");
}

beforeEach(() => {
  abortSignals.length = 0;
});

describe("fetchMonthRows", () => {
  it("pages in windows of 500 (well under PostgREST's ceiling)", () => {
    expect(PAGE_SIZE).toBe(500);
  });

  it("returns a month that fits in one page, decrypted in server order", async () => {
    const { calls } = setup(pages({ data: rows(0, 3), error: null, count: 3 }));
    const decrypt = makeDecrypt();
    const result = await fetchMonthRows("u1", month, decrypt);
    expect(result.map((t) => t.id)).toEqual(["t0", "t1", "t2"]);
    expect(decrypt).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([{ table: "transactions", op: "select", range: [0, 499] }]);
    // No signal was given, so the query must not be tied to one.
    expect(abortSignals).toEqual([]);
  });

  it("walks a month larger than a page across advancing ranges", async () => {
    const { calls } = setup(
      pages(
        { data: rows(0, 500), error: null, count: 1200 },
        { data: rows(500, 1000), error: null, count: 1200 },
        { data: rows(1000, 1200), error: null, count: 1200 },
      ),
    );
    const decrypt = makeDecrypt();
    const result = await fetchMonthRows("u1", month, decrypt);
    expect(result).toHaveLength(1200);
    expect(result[0].id).toBe("t0");
    expect(result[1199].id).toBe("t1199");
    expect(decrypt).toHaveBeenCalledTimes(1200);
    expect(calls.map((c) => c.range)).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("de-duplicates a row that straddles two pages, decrypting it once", async () => {
    // The offset advances by rows *received* (including the repeat), so the
    // loop stops once it has walked past `count`; the count itself is the
    // number of distinct rows, which is what the final size check compares.
    setup(
      pages(
        { data: [row("a"), row("b")], error: null, count: 3 },
        { data: [row("b"), row("c")], error: null, count: 3 },
      ),
    );
    const decrypt = makeDecrypt();
    const result = await fetchMonthRows("u1", month, decrypt);
    expect(result.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(decrypt).toHaveBeenCalledTimes(2 + 1);
  });

  it("reports a query error as incomplete", async () => {
    setup(pages({ data: null, error: { message: "boom" }, count: null }));
    await expectIncomplete(fetchMonthRows("u1", month, makeDecrypt()));
  });

  it("reports null data as incomplete", async () => {
    setup(pages({ data: null, error: null, count: 0 }));
    await expectIncomplete(fetchMonthRows("u1", month, makeDecrypt()));
  });

  it("reports a missing count as incomplete", async () => {
    // Without an exact count the loop can't know when the month is complete,
    // whether the count came back null or was never requested.
    setup(pages({ data: rows(0, 1), error: null, count: null }));
    await expectIncomplete(fetchMonthRows("u1", month, makeDecrypt()));
    setup(pages({ data: rows(0, 1), error: null }));
    await expectIncomplete(fetchMonthRows("u1", month, makeDecrypt()));
  });

  it("gives up when the count moves between pages", async () => {
    // An entry added mid-fetch shifts every later page; the pages no longer
    // line up, so the whole month has to be re-read.
    setup(
      pages(
        { data: rows(0, 500), error: null, count: 600 },
        { data: rows(500, 600), error: null, count: 601 },
      ),
    );
    const decrypt = makeDecrypt();
    await expectIncomplete(fetchMonthRows("u1", month, decrypt));
    expect(decrypt).toHaveBeenCalledTimes(500);
  });

  it("gives up on an empty page while rows are still owed", async () => {
    const { calls } = setup(
      pages(
        { data: rows(0, 1), error: null, count: 2 },
        { data: [], error: null, count: 2 },
      ),
    );
    await expectIncomplete(fetchMonthRows("u1", month, makeDecrypt()));
    // It must not keep asking for the page that will never come.
    expect(calls).toHaveLength(2);
  });

  it("refuses a result whose distinct rows fall short of the count", async () => {
    // Duplicates push the offset past `count` so paging stops, but only two
    // distinct rows arrived for a count of three.
    setup(
      pages(
        { data: [row("a"), row("b")], error: null, count: 3 },
        { data: [row("b"), row("b")], error: null, count: 3 },
      ),
    );
    const decrypt = makeDecrypt();
    await expectIncomplete(fetchMonthRows("u1", month, decrypt));
    expect(decrypt).toHaveBeenCalledTimes(2);
  });

  it("rejects with AbortError before any request when already aborted", async () => {
    const { calls } = setup(pages({ data: rows(0, 1), error: null, count: 1 }));
    const controller = new AbortController();
    controller.abort();
    const err = await fetchMonthRows("u1", month, makeDecrypt(), controller.signal).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    expect(calls).toEqual([]);
  });

  it("reports an abort during the request as AbortError, not incomplete", async () => {
    const controller = new AbortController();
    // supabase-js surfaces a cancelled fetch as a query error; the cancellation
    // must win over the generic "incomplete" so the screen doesn't offer a retry.
    setup(() => {
      controller.abort();
      return { data: null, error: { message: "AbortError" }, count: null };
    });
    const err = await fetchMonthRows("u1", month, makeDecrypt(), controller.signal).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    expect(abortSignals).toEqual([controller.signal]);
  });

  it("ties every page to the signal when one is given", async () => {
    setup(
      pages(
        { data: rows(0, 500), error: null, count: 501 },
        { data: rows(500, 501), error: null, count: 501 },
      ),
    );
    const controller = new AbortController();
    const result = await fetchMonthRows("u1", month, makeDecrypt(), controller.signal);
    expect(result).toHaveLength(501);
    expect(abortSignals).toEqual([controller.signal, controller.signal]);
  });
});
