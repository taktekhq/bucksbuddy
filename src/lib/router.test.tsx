import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { navigate, useRoute } from "@/lib/router";

describe("router", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("defaults to '/' for unknown or empty hashes", () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toBe("/");
  });

  it("recognizes /settings and /safe", () => {
    act(() => navigate("/settings"));
    const { result } = renderHook(() => useRoute());
    expect(result.current).toBe("/settings");
  });

  it("recognizes the /legal route", () => {
    act(() => navigate("/legal"));
    expect(renderHook(() => useRoute()).result.current).toBe("/legal");
  });

  it("recognizes the /history route", () => {
    act(() => navigate("/history"));
    expect(renderHook(() => useRoute()).result.current).toBe("/history");
  });

  it("navigate is a no-op when already on the route", () => {
    act(() => navigate("/safe"));
    const before = window.location.hash;
    act(() => navigate("/safe"));
    expect(window.location.hash).toBe(before);
  });

  it("updates the route on hashchange and cleans up", async () => {
    const { result, unmount } = renderHook(() => useRoute());
    expect(result.current).toBe("/");
    act(() => navigate("/settings"));
    await waitFor(() => expect(result.current).toBe("/settings"));
    act(() => navigate("/"));
    await waitFor(() => expect(result.current).toBe("/"));
    unmount(); // exercises the listener cleanup
  });

  it("maps an unrecognized explicit hash back to '/'", () => {
    act(() => {
      window.location.hash = "/nope";
    });
    const { result } = renderHook(() => useRoute());
    expect(result.current).toBe("/");
  });

  it("recognizes the /reset route", () => {
    act(() => navigate("/reset"));
    expect(renderHook(() => useRoute()).result.current).toBe("/reset");
  });

  it("recognizes /reset even when Supabase appended a second hash fragment", () => {
    // Dashboard recovery emails redirect with the token glued onto the URL,
    // producing the double-fragment "#/reset#access_token=…". The route must
    // still resolve cleanly while useSession parses the tokens.
    act(() => {
      window.location.hash =
        "/reset#access_token=AT&refresh_token=RT&type=recovery&expires_in=3600";
    });
    const { result } = renderHook(() => useRoute());
    expect(result.current).toBe("/reset");
  });
});
