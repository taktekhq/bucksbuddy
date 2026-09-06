// Adapted from the web's src/components/HistoryList.test.tsx, which covers the
// same row (there the swipe lived inside HistoryList; here it is its own
// component). The web drives framer-motion's drag callbacks; the mobile port
// drives the gesture handler's callbacks — same three outcomes (open left, open
// right, snap back) and the same auto-close timer.

// Reanimated's own mock (`react-native-reanimated/mock`) pulls in the real
// module, which needs the worklets native module, so it throws under jest. This
// is the same shape, minus the parts nothing here uses. `withTiming` settles
// immediately, so a shared value always holds the animation's target.
const mockStyleFns: Array<() => { transform: [{ translateX: number }] }> = [];
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (c: unknown) => c },
    Easing: { bezier: () => ({}) },
    runOnJS: (fn: unknown) => fn,
    // Stable per hook call, like the real one — a fresh object each render
    // would retrigger every effect that depends on a shared value.
    useSharedValue: (v: unknown) => {
      const ref = React.useRef(null);
      if (ref.current === null) ref.current = { value: v };
      return ref.current;
    },
    useAnimatedStyle: (fn: () => unknown) => {
      mockStyleFns.push(fn as () => { transform: [{ translateX: number }] });
      return fn();
    },
    withTiming: (to: unknown, _c: unknown, cb?: (finished: boolean) => void) => {
      cb?.(true);
      return to;
    },
  };
});

// The gestures are built in JS and recognised natively, so the recogniser is
// what a test can't have. The builders record their callbacks instead, and the
// tests drive those directly — the component's own logic, minus the native
// recognition.
const mockGestures: Array<{ race: MockGesture[] }> = [];
type MockGesture = { handlers: Record<string, (...a: unknown[]) => void> };
jest.mock("react-native-gesture-handler", () => {
  const build = () => {
    const g: Record<string, unknown> & { handlers: Record<string, unknown> } = {
      handlers: {},
    };
    for (const m of ["activeOffsetX", "failOffsetY"]) g[m] = () => g;
    for (const m of ["onBegin", "onStart", "onUpdate", "onEnd", "onFinalize"]) {
      g[m] = (fn: unknown) => {
        g.handlers[m] = fn;
        return g;
      };
    }
    return g;
  };
  return {
    Gesture: { Pan: build, Tap: build, Race: (...gs: unknown[]) => ({ race: gs }) },
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: unknown }) => {
      mockGestures.push(gesture as { race: MockGesture[] });
      return children;
    },
  };
});

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SwipeRow } from "@/components/SwipeRow";
import type { Transaction } from "@/types/db";

const ACTION_W = 76;

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1250,
    original_currency: "USD",
    original_amount: 12.5,
    rate_used: 89500,
    occurred_at: "2026-06-01T10:00:00.000Z",
    note: null,
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

/** How far the row is currently slid, read off the style it renders with. */
const offset = () => mockStyleFns[0]().transform[0].translateX;
/** The pan and tap halves of the row's `Gesture.Race`. */
const pan = () => mockGestures[0].race[0].handlers;
const tap = () => mockGestures[0].race[1].handlers;

/** A pan that ends with `velocityX`, from wherever the row currently sits. */
function fling(velocityX: number) {
  pan().onBegin();
  pan().onStart();
  pan().onEnd({ velocityX });
}

beforeEach(() => {
  // React's async `act` (RNTL 14 renders through it) needs the microtask queue
  // to stay real, or a render never flushes.
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick", "setImmediate"] });
  mockStyleFns.length = 0;
  mockGestures.length = 0;
});
afterEach(() => jest.useRealTimers());

describe("SwipeRow", () => {
  it("renders an expense row with a minus, the note and the date", async () => {
    await render(
      <SwipeRow tx={tx({ note: "Milk" })} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Milk")).toBeTruthy();
    expect(screen.getByText("Jun 1")).toBeTruthy();
    expect(screen.getByText("-$12.50")).toBeTruthy();
  });

  it("renders an income row with a plus and an LBP marker", async () => {
    await render(
      <SwipeRow
        tx={tx({ is_income: true, original_currency: "LBP" })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("+$12.50")).toBeTruthy();
    expect(screen.getByText("Jun 1 · LBP")).toBeTruthy();
    // No note line when the transaction has none.
    expect(screen.queryByText("Milk")).toBeNull();
  });

  it("shows the masked stand-in instead of the amount when locked", async () => {
    await render(
      <SwipeRow tx={tx({ amountMask: "a8F2" })} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByText("-$a8F2")).toBeTruthy();
    expect(screen.queryByText("-$12.50")).toBeNull();
  });

  it("renders the dark variant with the same content", async () => {
    await render(
      <SwipeRow tx={tx({ note: "Milk" })} onEdit={() => {}} onDelete={() => {}} dark />,
    );
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Milk")).toBeTruthy();
    expect(screen.getByText("-$12.50")).toBeTruthy();
  });

  it("fires edit and delete, and closes the row behind them", async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const row = tx();
    await render(<SwipeRow tx={row} onEdit={onEdit} onDelete={onDelete} />);

    fling(1000); // open to the right, revealing Edit
    expect(offset()).toBe(ACTION_W);
    await fireEvent.press(screen.getByLabelText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(row);
    expect(offset()).toBe(0);

    fling(-1000); // open to the left, revealing Delete
    expect(offset()).toBe(-ACTION_W);
    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(row);
    expect(offset()).toBe(0);
  });

  it("opens on a fling and auto-closes after the timeout", async () => {
    await render(<SwipeRow tx={tx()} onEdit={() => {}} onDelete={() => {}} />);
    fling(-1000);
    expect(offset()).toBe(-ACTION_W);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(offset()).toBe(0);
  });

  it("closes an open row on tap and ignores a tap on a closed one", async () => {
    await render(<SwipeRow tx={tx()} onEdit={() => {}} onDelete={() => {}} />);
    fling(1000);
    expect(offset()).toBe(ACTION_W);
    tap().onEnd();
    expect(offset()).toBe(0);
    tap().onEnd(); // already closed — no-op
    expect(offset()).toBe(0);
  });

  it("clamps the drag past the action width and lets it stretch a little", async () => {
    await render(<SwipeRow tx={tx()} onEdit={() => {}} onDelete={() => {}} />);
    pan().onBegin();
    pan().onStart();
    pan().onUpdate({ translationX: -30 });
    expect(offset()).toBe(-30); // inside the constraint: follows the finger
    pan().onUpdate({ translationX: -100 });
    // Clamped at -76, with 6% of the overshoot given back.
    expect(offset()).toBeCloseTo(-ACTION_W - 24 * 0.06, 5);
    pan().onUpdate({ translationX: 100 });
    expect(offset()).toBeCloseTo(ACTION_W + 24 * 0.06, 5);
  });

  it("snaps back when the swipe is too small to commit", async () => {
    await render(<SwipeRow tx={tx()} onEdit={() => {}} onDelete={() => {}} />);
    fling(100); // projected 8px — under half the action width
    expect(offset()).toBe(0);
    // A row that settles closed arms no auto-close timer.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(offset()).toBe(0);
  });

  it("settles a cancelled drag to the nearest resting position", async () => {
    await render(<SwipeRow tx={tx()} onEdit={() => {}} onDelete={() => {}} />);
    const dragTo = (translationX: number) => {
      pan().onBegin();
      pan().onStart();
      pan().onUpdate({ translationX });
    };

    dragTo(-50);
    pan().onFinalize({}, false);
    expect(offset()).toBe(-ACTION_W);

    dragTo(ACTION_W + 50); // from -76 back out to the right
    pan().onFinalize({}, false);
    expect(offset()).toBe(ACTION_W);

    dragTo(-ACTION_W + 5); // ends near the middle
    pan().onFinalize({}, false);
    expect(offset()).toBe(0);

    // A finalize that succeeded, and one at a resting position, both leave the
    // row where it is.
    fling(-1000);
    pan().onFinalize({}, true);
    expect(offset()).toBe(-ACTION_W);
    pan().onFinalize({}, false);
    expect(offset()).toBe(-ACTION_W);
  });

  it("clears the pending auto-close timer on unmount", async () => {
    const view = await render(
      <SwipeRow tx={tx()} onEdit={() => {}} onDelete={() => {}} />,
    );
    fling(-1000);
    await view.unmount();
    // The timer would have snapped the row shut; cleanup cancelled it.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(offset()).toBe(-ACTION_W);
  });
});
