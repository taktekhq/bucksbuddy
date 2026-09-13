import { vi } from "vitest";

export type QueryResult = {
  data?: unknown;
  error?: { message: string } | null;
  // Only present when the query asked for one (`select("*", { count })`).
  count?: number | null;
};
export type Handler = () => QueryResult | Promise<QueryResult>;

// A chainable Supabase query-builder mock. Every builder method returns the
// same thenable builder; awaiting it resolves to a handler looked up by
// `"<table>:<op>"` (e.g. "transactions:insert") or, as a fallback, by table.
//
// Ops are inferred from which mutating method was called: insert/update/delete,
// defaulting to "select" for plain reads.
export function makeSupabaseMock(handlers: Record<string, Handler> = {}) {
  // `range` records the row window a paginated read asked for, so a test can
  // check the pages line up.
  const calls: { table: string; op: string; range?: [number, number] }[] = [];

  function from(table: string) {
    let op = "select";
    let range: [number, number] | undefined;
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
      gte: () => builder,
      lt: () => builder,
      order: () => builder,
      limit: () => builder,
      range: (from: number, to: number) => {
        range = [from, to];
        return builder;
      },
      abortSignal: () => builder,
      single: () => builder,
      maybeSingle: () => builder,
      then: (
        resolve: (v: QueryResult) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        calls.push(range ? { table, op, range } : { table, op });
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

  return { supabase: { from: vi.fn(from), auth }, calls };
}
