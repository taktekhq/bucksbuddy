import { vi } from "vitest";

export type QueryResult = { data?: unknown; error?: { message: string } | null };
export type Handler = () => QueryResult | Promise<QueryResult>;

// A chainable Supabase query-builder mock. Every builder method returns the
// same thenable builder; awaiting it resolves to a handler looked up by
// `"<table>:<op>"` (e.g. "transactions:insert") or, as a fallback, by table.
//
// Ops are inferred from which mutating method was called: insert/update/delete,
// defaulting to "select" for plain reads.
// A recorded query: which table, which operation, and the arguments each
// builder method was called with. The arguments matter — column lists, filter
// keys and payload fields are the contract with the database, and a test that
// only checks "an update happened" would pass against an update of the wrong
// column, or one filtered on the wrong user.
export type RecordedCall = {
  table: string;
  op: string;
  args: Record<string, unknown[][]>;
};

export function makeSupabaseMock(handlers: Record<string, Handler> = {}) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    let op = "select";
    const args: Record<string, unknown[][]> = {};
    const record = (name: string, callArgs: unknown[]) => {
      (args[name] ??= []).push(callArgs);
      return builder;
    };
    const builder: Record<string, unknown> = {
      select: (...a: unknown[]) => record("select", a),
      insert: (...a: unknown[]) => {
        op = "insert";
        return record("insert", a);
      },
      upsert: (...a: unknown[]) => {
        op = "upsert";
        return record("upsert", a);
      },
      update: (...a: unknown[]) => {
        op = "update";
        return record("update", a);
      },
      delete: (...a: unknown[]) => {
        op = "delete";
        return record("delete", a);
      },
      eq: (...a: unknown[]) => record("eq", a),
      order: () => builder,
      limit: () => builder,
      single: () => builder,
      maybeSingle: () => builder,
      then: (
        resolve: (v: QueryResult) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        calls.push({ table, op, args });
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
