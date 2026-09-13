import { vi } from "vitest";

export type QueryResult = { data?: unknown; error?: { message: string } | null };
export type Handler = () => QueryResult | Promise<QueryResult>;

// A chainable Supabase query-builder mock. Every builder method returns the
// same thenable builder; awaiting it resolves to a handler looked up by
// `"<table>:<op>"` (e.g. "transactions:insert") or, as a fallback, by table.
//
// Ops are inferred from which mutating method was called: insert/update/delete,
// defaulting to "select" for plain reads.
export function makeSupabaseMock(handlers: Record<string, Handler> = {}) {
  const calls: { table: string; op: string }[] = [];
  // Paged reads (store.reviewRange) call .range() once per page, so a handler
  // can answer differently per call by counting.
  const ranges: { from: number; to: number }[] = [];

  function from(table: string) {
    let op = "select";
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: () => {
        op = "insert";
        return builder;
      },
      upsert: () => {
        op = "upsert";
        return builder;
      },
      update: () => {
        op = "update";
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      eq: () => builder,
      neq: () => builder,
      gte: () => builder,
      lt: () => builder,
      order: () => builder,
      limit: () => builder,
      range: (from: number, to: number) => {
        ranges.push({ from, to });
        return builder;
      },
      single: () => builder,
      maybeSingle: () => builder,
      then: (
        resolve: (v: QueryResult) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        calls.push({ table, op });
        const key = `${table}:${op}`;
        const handler = handlers[key] ?? handlers[table];
        const result = handler ? handler() : { data: null, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }

  const auth = {
    getSession: vi.fn(
      async (..._args: unknown[]): Promise<{ data: { session: unknown } }> => ({
        data: { session: null },
      }),
    ),
    onAuthStateChange: vi.fn((..._args: unknown[]) => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    signInWithOAuth: vi.fn(async (..._args: unknown[]) => ({ error: null })),
    signInWithPassword: vi.fn(async (..._args: unknown[]) => ({ error: null })),
    signOut: vi.fn(async (..._args: unknown[]) => ({ error: null })),
  };

  // `rpc` and `functions.invoke` are keyed the same way as tables, by name:
  // "rpc:report_eligibility" and "fn:review-checkout".
  const rpc = vi.fn(async (name: string, ..._args: unknown[]) => {
    calls.push({ table: name, op: "rpc" });
    const handler = handlers[`rpc:${name}`];
    return handler ? await handler() : { data: null, error: null };
  });

  const functions = {
    invoke: vi.fn(async (name: string, ..._args: unknown[]) => {
      calls.push({ table: name, op: "invoke" });
      const handler = handlers[`fn:${name}`];
      return handler ? await handler() : { data: null, error: null };
    }),
  };

  return { supabase: { from: vi.fn(from), auth, rpc, functions }, calls, ranges };
}
