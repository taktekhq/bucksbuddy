import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHistoryGrouping } from "@/lib/useHistoryGrouping";

const KEY = "bb-history-grouping";

describe("useHistoryGrouping", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("defaults to the timeline view when nothing is stored", () => {
    const { result } = renderHook(() => useHistoryGrouping());
    expect(result.current[0]).toBe("timeline");
  });

  it("restores a previously chosen category view", () => {
    localStorage.setItem(KEY, "category");
    const { result } = renderHook(() => useHistoryGrouping());
    expect(result.current[0]).toBe("category");
  });

  it("persists the choice across the effect", () => {
    const { result } = renderHook(() => useHistoryGrouping());
    act(() => result.current[1]("category"));
    expect(result.current[0]).toBe("category");
    expect(localStorage.getItem(KEY)).toBe("category");
  });

  it("falls back to timeline when storage reads throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { result } = renderHook(() => useHistoryGrouping());
    expect(result.current[0]).toBe("timeline");
  });

  it("swallows write failures so the toggle still works for the session", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage full");
    });
    const { result } = renderHook(() => useHistoryGrouping());
    expect(() => act(() => result.current[1]("category"))).not.toThrow();
    expect(result.current[0]).toBe("category");
  });
});
