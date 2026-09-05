// Ported from the web's src/lib/useSession.test.tsx. Every assertion there has
// a twin here; the one mechanical change is where the recovery tokens come
// from — a deep link (expo-linking) instead of window.location.hash — and that
// the initial read is therefore async.
const mockGetSession = jest.fn();
const mockSetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => (mockGetSession as (...a: unknown[]) => unknown)(...args),
      setSession: (...args: unknown[]) => (mockSetSession as (...a: unknown[]) => unknown)(...args),
      onAuthStateChange: (...args: unknown[]) => (mockOnAuthStateChange as (...a: unknown[]) => unknown)(...args),
    },
  },
}));

const mockGetInitialURL = jest.fn();
const mockAddEventListener = jest.fn();
jest.mock("expo-linking", () => ({
  getInitialURL: (...args: unknown[]) => (mockGetInitialURL as (...a: unknown[]) => unknown)(...args),
  addEventListener: (...args: unknown[]) => (mockAddEventListener as (...a: unknown[]) => unknown)(...args),
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import posthog from "@/lib/posthog";
import { useSession } from "@/lib/useSession";

type Listener = (event: string, session: unknown) => void;

const RECOVERY_URL =
  "bucksbuddy:///#access_token=AT&expires_at=1780669034&expires_in=3600" +
  "&refresh_token=RT&token_type=bearer&type=recovery";

const linkRemove = jest.fn();
let listener: Listener = () => {};
let urlHandler: (event: { url: string }) => void = () => {};

beforeEach(() => {
  listener = () => {};
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSetSession.mockResolvedValue({ data: { session: null }, error: null });
  mockOnAuthStateChange.mockImplementation((cb: Listener) => {
    listener = cb;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });
  mockGetInitialURL.mockResolvedValue(null);
  mockAddEventListener.mockImplementation(
    (_event: string, cb: (e: { url: string }) => void) => {
      urlHandler = cb;
      return { remove: linkRemove };
    },
  );
});

describe("useSession", () => {
  it("reads the cached session and flips ready", async () => {
    const fakeSession = { user: { id: "u1", email: "x@y.com" } };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.session).toBe(fakeSession);
    expect(posthog.identify).toHaveBeenCalledWith("u1");
  });

  it("stays signed out (and silent) when there's no cached session", async () => {
    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.session).toBeNull();
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("updates session on auth state changes and unsubscribes on unmount", async () => {
    const { result, unmount } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const next = { user: { id: "u2", email: "a@b.com" } };
    await act(async () => listener("SIGNED_IN", next));
    expect(result.current.session).toBe(next);
    expect(posthog.identify).toHaveBeenCalledWith("u2");
    expect(posthog.capture).toHaveBeenCalledWith("signed_in");

    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(linkRemove).toHaveBeenCalledTimes(1);
  });

  it("does not identify with PostHog when SIGNED_IN carries no session", async () => {
    // Supabase types allow a null session on any event; identifying would then
    // crash on s.user, so the handler must skip analytics entirely.
    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => listener("SIGNED_IN", null));
    expect(result.current.session).toBeNull();
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("flips recoveryMode on PASSWORD_RECOVERY and clears it on SIGNED_OUT", async () => {
    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.recoveryMode).toBe(false);

    // A plain SIGNED_IN must NOT enable recovery — only PASSWORD_RECOVERY can,
    // because that's the event proving the user came from a reset link.
    await act(async () => listener("SIGNED_IN", { user: { id: "u1" } }));
    expect(result.current.recoveryMode).toBe(false);

    await act(async () => listener("PASSWORD_RECOVERY", { user: { id: "u1" } }));
    expect(result.current.recoveryMode).toBe(true);

    await act(async () => listener("SIGNED_OUT", null));
    expect(result.current.recoveryMode).toBe(false);
    expect(posthog.reset).toHaveBeenCalledTimes(1);
  });

  it("parses implicit-flow recovery tokens from the launch link", async () => {
    mockGetInitialURL.mockResolvedValue(RECOVERY_URL);
    const recoverySession = { user: { id: "u1", email: "x@y.com" } };
    mockSetSession.mockResolvedValue({
      data: { session: recoverySession },
      error: null,
    });

    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "AT",
      refresh_token: "RT",
    });
    expect(result.current.session).toBe(recoverySession);
    expect(result.current.recoveryMode).toBe(true);
    // The normal cached-session path is skipped — we already have a session.
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("handles a recovery link opened while the app is already running", async () => {
    const recoverySession = { user: { id: "u1", email: "x@y.com" } };
    mockSetSession.mockResolvedValue({
      data: { session: recoverySession },
      error: null,
    });

    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.recoveryMode).toBe(false);

    await act(async () => urlHandler({ url: RECOVERY_URL }));
    await waitFor(() => expect(result.current.recoveryMode).toBe(true));
    expect(result.current.session).toBe(recoverySession);
  });

  it("stays signed out when the recovery tokens are rejected", async () => {
    mockGetInitialURL.mockResolvedValue(RECOVERY_URL);
    mockSetSession.mockResolvedValue({
      data: { session: null },
      error: { message: "expired" },
    });

    const { result } = await renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.recoveryMode).toBe(false);
    expect(result.current.session).toBeNull();
    // A recovery link was still recognised, so the cached-session read is skipped.
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("ignores a launch link that isn't a recovery callback", async () => {
    mockGetInitialURL.mockResolvedValue("bucksbuddy:///safe");
    await renderHook(() => useSession());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("ignores a cold start with no link at all", async () => {
    mockGetInitialURL.mockResolvedValue(null);
    await renderHook(() => useSession());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("treats a malformed recovery link with missing tokens as no recovery", async () => {
    // Passes the marker check ("type=recovery" and "access_token=" are both
    // present) but the values are empty, so URLSearchParams returns null. Must
    // fall through to getSession rather than calling setSession with bogus
    // tokens.
    mockGetInitialURL.mockResolvedValue("bucksbuddy:///#access_token=&type=recovery");
    await renderHook(() => useSession());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("drops a launch link that resolves after the screen is gone", async () => {
    let release!: (url: string | null) => void;
    mockGetInitialURL.mockReturnValue(
      new Promise<string | null>((resolve) => {
        release = resolve;
      }),
    );

    const { result, unmount } = await renderHook(() => useSession());
    await unmount();
    await act(async () => release(RECOVERY_URL));

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });

  it("drops a cached session that resolves after the screen is gone", async () => {
    let release!: (value: { data: { session: unknown } }) => void;
    mockGetSession.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const { result, unmount } = await renderHook(() => useSession());
    await unmount();
    await act(async () =>
      release({ data: { session: { user: { id: "late", email: null } } } }),
    );

    expect(result.current.session).toBeNull();
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("drops recovery tokens that resolve after the screen is gone", async () => {
    mockGetInitialURL.mockResolvedValue(RECOVERY_URL);
    let release!: (value: { data: { session: unknown }; error: null }) => void;
    mockSetSession.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const { result, unmount } = await renderHook(() => useSession());
    await waitFor(() => expect(mockSetSession).toHaveBeenCalled());
    await unmount();
    await act(async () =>
      release({ data: { session: { user: { id: "late" } } }, error: null }),
    );

    expect(result.current.recoveryMode).toBe(false);
    expect(result.current.session).toBeNull();
  });
});
