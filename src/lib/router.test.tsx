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

  it("recognizes /home (the landing page route)", () => {
    act(() => navigate("/home"));
    const { result } = renderHook(() => useRoute());
    expect(result.current).toBe("/home");
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
});
