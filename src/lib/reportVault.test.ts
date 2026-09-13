import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { makeSupabaseMock, type Handler } from "@/test/supabaseMock";

// Real crypto, mocked database. The stored token is minted by the module itself
// (setReviewPassphrase), so the wrong-passphrase test below is a genuine
// AES-GCM authentication failure rather than a stubbed rejection.
let mock = makeSupabaseMock();

// makeSupabaseMock drops builder arguments, and the whole point of
// setReviewPassphrase is *what* it writes, so wrap the builder's upsert to
// record the row on its way through.
const upserts: { table: string; row: Record<string, unknown> }[] = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const builder = mock.supabase.from(table);
      const original = builder.upsert as (...args: unknown[]) => unknown;
      builder.upsert = (row: Record<string, unknown>, ...rest: unknown[]) => {
        upserts.push({ table, row });
        return original(row, ...rest);
      };
      return builder;
    },
  },
}));

import {
  checkReviewPassphrase,
  hasReviewPassphrase,
  setReviewPassphrase,
} from "@/lib/reportVault";

function set(handlers: Record<string, Handler> = {}) {
  mock = makeSupabaseMock(handlers);
}

const PASSPHRASE = "the archive, please";

// PBKDF2 runs 600,000 real iterations per derivation, so the stored token is
// minted exactly once for the whole file and every check below reuses it.
let storedVerifier = "";
let setOutcome: { error: string | null } = { error: "not run" };

beforeAll(async () => {
  set({ "review_access:upsert": () => ({ error: null }) });
  setOutcome = await setReviewPassphrase("u1", PASSPHRASE);
  storedVerifier = String(upserts[0].row.verifier);
}, 30_000);

describe("hasReviewPassphrase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is set, with no error, when the account has a review_access row", async () => {
    set({ "review_access:select": () => ({ data: { verifier: "v1.a.b.c" } }) });
    expect(await hasReviewPassphrase("u1")).toEqual({ set: true, error: null });
    expect(mock.calls).toEqual([{ table: "review_access", op: "select" }]);
  });

  it("is not set, with no error, when there is no row at all", async () => {
    set(); // unmatched handler resolves { data: null, error: null }
    expect(await hasReviewPassphrase("u1")).toEqual({ set: false, error: null });
  });

  it("reports the read failure instead of answering 'no passphrase'", async () => {
    // The one wrong answer. A bare false here would leave the archive open on
    // the strength of a row nobody could read, so the message comes back with
    // it and the screen keeps the archive locked.
    set({
      "review_access:select": () => ({
        data: null,
        error: { message: "permission denied for table review_access" },
      }),
    });
    expect(await hasReviewPassphrase("u1")).toEqual({
      set: false,
      error: "permission denied for table review_access",
    });
  });
});

describe("setReviewPassphrase", () => {
  it("upserts a versioned wrapped token that does not contain the passphrase", () => {
    expect(setOutcome).toEqual({ error: null });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("review_access");
    expect(upserts[0].row.user_id).toBe("u1");
    // "v1.<salt>.<iv>.<ct>" — the crypto.ts wrapped-key envelope.
    expect(storedVerifier.split(".")).toHaveLength(4);
    expect(storedVerifier.startsWith("v1.")).toBe(true);
    expect(storedVerifier).not.toContain(PASSPHRASE);
    expect(storedVerifier).not.toContain("archive");
  });

  it("mints a different token every time, so the row leaks nothing about the passphrase", async () => {
    set({ "review_access:upsert": () => ({ error: null }) });
    const before = upserts.length;
    const res = await setReviewPassphrase("u1", PASSPHRASE);
    expect(res.error).toBeNull();
    const second = String(upserts[before].row.verifier);
    expect(second).not.toBe(storedVerifier);
  }, 30_000);

  it("passes a database error message through", async () => {
    set({
      "review_access:upsert": () => ({
        data: null,
        error: { message: "permission denied for table review_access" },
      }),
    });
    const res = await setReviewPassphrase("u1", "anything");
    expect(res.error).toBe("permission denied for table review_access");
  }, 30_000);
});

describe("checkReviewPassphrase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is false when no passphrase has ever been set", async () => {
    set(); // no review_access row
    expect(await checkReviewPassphrase("u1", PASSPHRASE)).toBe(false);
  });

  it("accepts the passphrase the token was wrapped under", async () => {
    set({ "review_access:select": () => ({ data: { verifier: storedVerifier } }) });
    expect(await checkReviewPassphrase("u1", PASSPHRASE)).toBe(true);
  }, 30_000);

  it("rejects a wrong passphrase against the very same token", async () => {
    set({ "review_access:select": () => ({ data: { verifier: storedVerifier } }) });
    expect(await checkReviewPassphrase("u1", `${PASSPHRASE}!`)).toBe(false);
  }, 30_000);

  it("rejects a corrupt token instead of throwing", async () => {
    set({ "review_access:select": () => ({ data: { verifier: "garbage" } }) });
    expect(await checkReviewPassphrase("u1", PASSPHRASE)).toBe(false);

    // A v1-tagged envelope whose salt is not base64 — throws inside the decode
    // rather than in AES-GCM, and must still read as "wrong passphrase".
    set({ "review_access:select": () => ({ data: { verifier: "v1.!!!.!!!.!!!" } }) });
    expect(await checkReviewPassphrase("u1", PASSPHRASE)).toBe(false);
  });
});
