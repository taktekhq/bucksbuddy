// Adapted from the web's src/components/RateEditor.test.tsx — same four cases
// (strip non-digits, commit on blur, ignore an unchanged value, revert junk),
// with the flashed check asserted directly since it has no text of its own.

// A complete, overridable Store value, as the web's src/test/storeValue.ts.
const mockStore = {
  lbpPerUsd: 89500,
  setRate: jest.fn(async () => ({ error: null })),
};
jest.mock("@/lib/store", () => ({ useStore: () => mockStore }));

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { RateEditor } from "@/components/RateEditor";

/**
 * The green check that flashes after a successful save. It has no text or
 * label of its own, so it is counted as what it renders: the row's only icon.
 */
const checks = () => screen.container.queryAll((n) => n.type === "RNSVGSvgView");

beforeEach(() => {
  // React's async `act` (RNTL 14 renders through it) needs the microtask queue
  // to stay real, or a render never flushes.
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick", "setImmediate"] });
  mockStore.lbpPerUsd = 89500;
});
afterEach(() => jest.useRealTimers());

describe("RateEditor", () => {
  it("shows the current rate and strips non-digits from the input", async () => {
    await render(<RateEditor />);
    const input = screen.getByLabelText("LBP per $1");
    expect(input.props.value).toBe("89500");
    await fireEvent.changeText(input, "9a0b0c0d0e0");
    expect(screen.getByLabelText("LBP per $1").props.value).toBe("900000");
  });

  it("commits a changed value on blur and flashes a check", async () => {
    await render(<RateEditor />);
    const input = screen.getByLabelText("LBP per $1");
    expect(checks()).toHaveLength(0);

    await fireEvent.changeText(input, "90000");
    await fireEvent(input, "blur");
    expect(mockStore.setRate).toHaveBeenCalledWith(90000);
    expect(checks()).toHaveLength(1);

    // The check clears after the timeout.
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(checks()).toHaveLength(0);
  });

  it("does nothing when the value is unchanged", async () => {
    await render(<RateEditor />);
    await fireEvent(screen.getByLabelText("LBP per $1"), "blur");
    expect(mockStore.setRate).not.toHaveBeenCalled();
    expect(checks()).toHaveLength(0);
  });

  it("reverts junk input on blur", async () => {
    await render(<RateEditor />);
    const input = screen.getByLabelText("LBP per $1");

    await fireEvent.changeText(input, "");
    await fireEvent(input, "blur");
    expect(screen.getByLabelText("LBP per $1").props.value).toBe("89500");

    // Zero is junk too — a rate has to be positive.
    await fireEvent.changeText(input, "0");
    await fireEvent(input, "blur");
    expect(screen.getByLabelText("LBP per $1").props.value).toBe("89500");

    expect(mockStore.setRate).not.toHaveBeenCalled();
  });
});
