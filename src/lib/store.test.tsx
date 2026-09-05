import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// All the business logic (data loading, encryption, caching edge cases) is
// tested against the real thing in packages/core/src/store.test.tsx. This
// file only proves the wiring: that this shim actually hands the real web
// supabase client, a localStorage-backed StoragePort, and a navigate-on-
// sign-out callback to the shared core, rather than testing store behavior
// a second time.
// Per-table results, defaulting to an empty/null read — only the tests that
// care about a specific table's response (e.g. a passphrase-tier e2e_keys
// row) override that table's entry.
const queryResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
function chain(table: string) {
  const result = () => queryResults[table] ?? { data: null, error: null };
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    upsert: () => builder,
    update: () => builder,
    insert: () => builder,
    delete: () => builder,
    then: (resolve: (v: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return builder;
}
const signOut = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => chain(table), auth: { signOut } },
}));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

import { StoreProvider, useStore } from "@/lib/store";

function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StoreProvider userId="u1">{children}</StoreProvider>
  );
  return renderHook(() => useStore(), { wrapper });
}

describe("store.tsx (web shim)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    for (const key of Object.keys(queryResults)) delete queryResults[key];
  });

  it("wires the real web supabase client through to the shared store", async () => {
    const { result } = setup();
    // If this weren't wired to the real (mocked) supabase client, the store
    // would never leave its initial loading state.
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("wires localStorage as the StoragePort — the passphrase persists across a re-render", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enableEncryption("a strong passphrase!");
    });
    expect(localStorage.getItem("bb-e2e-pass:u1")).toBe("a strong passphrase!");
  });

  it("hydrates synchronously from a cached snapshot already in localStorage", () => {
    localStorage.setItem(
      "bb-cache:u1",
      JSON.stringify({
        v: 1,
        transactions: [],
        lbpPerUsd: 91000,
        safeGoldEntries: [],
      }),
    );
    const { result } = setup();
    // No waitFor: this must be true on the very first synchronous render.
    expect(result.current.loading).toBe(false);
    expect(result.current.lbpPerUsd).toBe(91000);
  });

  it("reads a device-stored passphrase from localStorage for a passphrase-tier vault", async () => {
    // Real crypto isn't the point here (that's core's job) — just that a
    // passphrase-tier vault causes the shim to read localStorage for the
    // cached passphrase rather than skip straight to the default-tier path.
    localStorage.setItem("bb-e2e-pass:u1", "whatever's cached");
    queryResults["e2e_keys"] = {
      data: { wrapped_key: "garbage", wrap_type: "passphrase", verifier: "garbage" },
      error: null,
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.e2eMode).toBe("passphrase");
  });

  it("wires onSignedOut to navigate(\"/\")", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
