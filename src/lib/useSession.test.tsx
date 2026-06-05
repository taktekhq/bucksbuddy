import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const getSession = vi.fn();
const setSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      setSession: (...args: unknown[]) => setSession(...args),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChange(...args),
    },
  },
}));

import { useSession } from "@/lib/useSession";

describe("useSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
    getSession.mockResolvedValue({ data: { session: null } });
    setSession.mockResolvedValue({ data: { session: null }, error: null });
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
  });

  afterEach(() => {
    window.location.hash = "";
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

  it("parses implicit-flow recovery tokens from the hash, sets the session, and flips recoveryMode", async () => {
    // Mimic exactly what Supabase produces when the recovery email's redirect
    // URL already had "#/reset" — the dashboard appends its own hash, leaving
    // a double-fragment URL the SDK can't parse on its own.
    window.location.hash =
      "/reset#access_token=AT&expires_at=1780669034&expires_in=3600&refresh_token=RT&token_type=bearer&type=recovery";
    const recoverySession = { user: { id: "u1", email: "x@y.com" } };
    setSession.mockResolvedValue({ data: { session: recoverySession }, error: null });

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(setSession).toHaveBeenCalledWith({ access_token: "AT", refresh_token: "RT" });
    expect(result.current.session).toBe(recoverySession);
    expect(result.current.recoveryMode).toBe(true);
    // Tokens scrubbed from the URL; only the clean route remains so a refresh
    // doesn't replay them.
    expect(window.location.hash).toBe("#/reset");
    // The normal cached-session path is skipped — we already have a session.
    expect(getSession).not.toHaveBeenCalled();
  });

  it("scrubs the recovery tokens from the URL even when setSession fails", async () => {
    window.location.hash =
      "#access_token=AT&refresh_token=RT&type=recovery&expires_in=3600";
    setSession.mockResolvedValue({
      data: { session: null },
      error: { message: "expired" },
    });

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.recoveryMode).toBe(false);
    expect(result.current.session).toBeNull();
    expect(window.location.hash).toBe("#/reset");
  });

  it("ignores a hash that lacks the recovery markers and falls through to getSession", async () => {
    window.location.hash = "/settings";
    renderHook(() => useSession());
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(setSession).not.toHaveBeenCalled();
  });
});
