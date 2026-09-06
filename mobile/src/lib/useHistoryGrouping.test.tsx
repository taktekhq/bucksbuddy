// Ported from the web's src/lib/useHistoryGrouping.test.tsx. Same behaviour —
// default to the timeline, restore a stored "category", persist every change,
// survive an unusable store — except the read is async here (AsyncStorage), so
// the hook also reports a `hydrated` flag and starts on the default.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useHistoryGrouping } from "@/lib/useHistoryGrouping";

const KEY = "bb-history-grouping";
const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

describe("useHistoryGrouping", () => {
  it("defaults to the timeline view when nothing is stored", async () => {
    const { result } = await renderHook(() => useHistoryGrouping());
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBe("timeline");
    expect(getItem).toHaveBeenCalledWith(KEY);
  });

  it("restores a previously chosen category view", async () => {
    await AsyncStorage.setItem(KEY, "category");
    const { result } = await renderHook(() => useHistoryGrouping());
    await waitFor(() => expect(result.current[0]).toBe("category"));
    expect(result.current[2]).toBe(true);
  });

  it("persists the choice once hydrated", async () => {
    const { result } = await renderHook(() => useHistoryGrouping());
    await waitFor(() => expect(result.current[2]).toBe(true));
    setItem.mockClear();

    await act(async () => result.current[1]("category"));
    expect(result.current[0]).toBe("category");
    await waitFor(() => expect(setItem).toHaveBeenCalledWith(KEY, "category"));
  });

  it("does not write before the stored preference has been read", async () => {
    // Otherwise the default would immediately overwrite what's on disk.
    let release!: (v: string | null) => void;
    getItem.mockReturnValueOnce(
      new Promise<string | null>((resolve) => {
        release = resolve;
      }),
    );

    const { result } = await renderHook(() => useHistoryGrouping());
    expect(result.current[2]).toBe(false);
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => release("category"));
    await waitFor(() => expect(setItem).toHaveBeenCalledWith(KEY, "category"));
  });

  it("falls back to timeline when the read fails, and still hydrates", async () => {
    getItem.mockRejectedValueOnce(new Error("storage blocked"));
    const { result } = await renderHook(() => useHistoryGrouping());
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBe("timeline");
  });

  it("swallows write failures so the toggle still works for the session", async () => {
    setItem.mockRejectedValue(new Error("storage full"));
    const { result } = await renderHook(() => useHistoryGrouping());
    await waitFor(() => expect(result.current[2]).toBe(true));

    await act(async () => result.current[1]("category"));
    expect(result.current[0]).toBe("category");
    setItem.mockReset();
  });

  it("ignores a read that lands after the screen is gone", async () => {
    let release!: (v: string | null) => void;
    getItem.mockReturnValueOnce(
      new Promise<string | null>((resolve) => {
        release = resolve;
      }),
    );

    const { result, unmount } = await renderHook(() => useHistoryGrouping());
    await unmount();
    await act(async () => release("category"));

    // Never hydrated, never wrote back: the late read was dropped.
    expect(result.current[2]).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });
});
