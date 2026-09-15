import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecurringView } from "@/lib/useRecurringView";

const KEY = "bb-recurring-view";

describe("useRecurringView", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("defaults to the monthly side when nothing is stored", () => {
    const { result } = renderHook(() => useRecurringView());
    expect(result.current[0]).toBe("monthly");
  });

  it("restores a previously chosen yearly side", () => {
    localStorage.setItem(KEY, "yearly");
    const { result } = renderHook(() => useRecurringView());
    expect(result.current[0]).toBe("yearly");
  });

  it("persists the choice across the effect", () => {
    const { result } = renderHook(() => useRecurringView());
    act(() => result.current[1]("yearly"));
    expect(result.current[0]).toBe("yearly");
    expect(localStorage.getItem(KEY)).toBe("yearly");
  });

  it("falls back to monthly when storage reads throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { result } = renderHook(() => useRecurringView());
    expect(result.current[0]).toBe("monthly");
  });

  it("swallows write failures so the toggle still works for the session", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage full");
    });
    const { result } = renderHook(() => useRecurringView());
    act(() => result.current[1]("yearly"));
    expect(result.current[0]).toBe("yearly");
  });
});
