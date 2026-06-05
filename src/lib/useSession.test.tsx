import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChange(...args),
    },
  },
}));

import { useSession } from "@/lib/useSession";

describe("useSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
  });

  it("reads the cached session and flips ready", async () => {
    const fakeSession = { user: { id: "u1" } };
    getSession.mockResolvedValue({ data: { session: fakeSession } });

    const { result } = renderHook(() => useSession());
    expect(result.current.ready).toBe(false);

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.session).toBe(fakeSession);
  });

  it("updates session on auth state changes and unsubscribes on unmount", async () => {
    let listener: (event: string, s: unknown) => void = () => {};
    onAuthStateChange.mockImplementation((cb: typeof listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    });

    const { result, unmount } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const next = { user: { id: "u2" } };
    act(() => listener("SIGNED_IN", next));
    expect(result.current.session).toBe(next);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("flips recoveryMode on PASSWORD_RECOVERY and clears it on SIGNED_OUT", async () => {
    let listener: (event: string, s: unknown) => void = () => {};
    onAuthStateChange.mockImplementation((cb: typeof listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    });

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.recoveryMode).toBe(false);

    // A plain SIGNED_IN must NOT enable recovery — only PASSWORD_RECOVERY can,
    // because that's the event proving the user came from a reset link.
    act(() => listener("SIGNED_IN", { user: { id: "u1" } }));
    expect(result.current.recoveryMode).toBe(false);

    act(() => listener("PASSWORD_RECOVERY", { user: { id: "u1" } }));
    expect(result.current.recoveryMode).toBe(true);

    act(() => listener("SIGNED_OUT", null));
    expect(result.current.recoveryMode).toBe(false);
  });
});
