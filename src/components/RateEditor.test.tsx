import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { makeStoreValue } from "@/test/storeValue";

const storeValue = makeStoreValue({ lbpPerUsd: 89500 });
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

import { RateEditor } from "@/components/RateEditor";

describe("RateEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storeValue.setRate.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("strips non-digits from the input", () => {
    render(<RateEditor />);
    const input = screen.getByLabelText("LBP per $1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9a0b0c0d0e0" } });
    expect(input.value).toBe("900000");
  });

  it("commits a changed value on blur and flashes a check", async () => {
    render(<RateEditor />);
    const input = screen.getByLabelText("LBP per $1");
    fireEvent.change(input, { target: { value: "90000" } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(storeValue.setRate).toHaveBeenCalledWith(90000);
    // The check clears after the timeout.
    act(() => vi.advanceTimersByTime(1500));
  });

  it("does nothing when the value is unchanged", async () => {
    render(<RateEditor />);
    const input = screen.getByLabelText("LBP per $1");
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(storeValue.setRate).not.toHaveBeenCalled();
  });

  it("reverts junk input on blur", async () => {
    render(<RateEditor />);
    const input = screen.getByLabelText("LBP per $1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(input.value).toBe("89500"); // reverted to the store value
    expect(storeValue.setRate).not.toHaveBeenCalled();
  });
});
