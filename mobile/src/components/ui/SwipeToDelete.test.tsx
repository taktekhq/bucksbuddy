// Adapted from the web's src/components/ui/SwipeToDelete.test.tsx. The web
// drives framer-motion's drag callbacks; here the gesture handler's callbacks
// are driven directly — the same open / snap-back / auto-close outcomes, and
// the same delete-only constraint (nothing to the right of centre).

// Reanimated's own mock pulls in the real module (which needs the worklets
// native module) and throws under jest, so this is the same shape by hand.
// `withTiming` settles immediately, so a shared value always holds the target.
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

// The recogniser is native; the builders record their callbacks so the tests
// can drive the component's own gesture logic.
type MockGesture = { handlers: Record<string, (...a: unknown[]) => void> };
const mockGestures: Array<{ race: MockGesture[] }> = [];
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
import { Text } from "react-native";
import { SwipeToDelete } from "@/components/ui/SwipeToDelete";

const ACTION_W = 76;

/** How far the row is currently slid, read off the style it renders with. */
const offset = () => mockStyleFns[0]().transform[0].translateX;
const pan = () => mockGestures[0].race[0].handlers;
const tap = () => mockGestures[0].race[1].handlers;

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

describe("SwipeToDelete", () => {
  it("renders children and fires onDelete from the Delete button", async () => {
    const onDelete = jest.fn();
    await render(
      <SwipeToDelete onDelete={onDelete}>
        <Text>Row body</Text>
      </SwipeToDelete>,
    );
    expect(screen.getByText("Row body")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("closes the row behind the Delete button", async () => {
    await render(
      <SwipeToDelete onDelete={() => {}} className="bg-surface" deleteColor="#000000">
        <Text>x</Text>
      </SwipeToDelete>,
    );
    fling(-1000);
    expect(offset()).toBe(-ACTION_W);
    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(offset()).toBe(0);
  });

  it("opens on a left fling and auto-closes after the timeout", async () => {
    await render(
      <SwipeToDelete onDelete={() => {}}>
        <Text>x</Text>
      </SwipeToDelete>,
    );
    fling(-1000);
    expect(offset()).toBe(-ACTION_W);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(offset()).toBe(0);
  });

  it("closes an open row on tap and does nothing when it is already closed", async () => {
    await render(
      <SwipeToDelete onDelete={() => {}}>
        <Text>x</Text>
      </SwipeToDelete>,
    );
    fling(-1000);
    tap().onEnd();
    expect(offset()).toBe(0);
    tap().onEnd(); // already closed — no-op
    expect(offset()).toBe(0);
  });

  it("snaps back to closed on a small fling", async () => {
    await render(
      <SwipeToDelete onDelete={() => {}}>
        <Text>x</Text>
      </SwipeToDelete>,
    );
    fling(-100); // projected -8px — under half the action width
    expect(offset()).toBe(0);
    // A row that settles closed arms no auto-close timer.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(offset()).toBe(0);
  });

  it("never opens to the right, and stretches a little past the action", async () => {
    await render(
      <SwipeToDelete onDelete={() => {}}>
        <Text>x</Text>
      </SwipeToDelete>,
    );
    pan().onBegin();
    pan().onStart();
    pan().onUpdate({ translationX: -30 });
    expect(offset()).toBe(-30);
    pan().onUpdate({ translationX: -100 });
    // Clamped at -76, with 6% of the overshoot given back.
    expect(offset()).toBeCloseTo(-ACTION_W - 24 * 0.06, 5);
    pan().onUpdate({ translationX: 100 }); // dragging right is all rubber band
    expect(offset()).toBeCloseTo(100 * 0.06, 5);
  });

  it("settles a cancelled drag to the nearest resting position", async () => {
    await render(
      <SwipeToDelete onDelete={() => {}}>
        <Text>x</Text>
      </SwipeToDelete>,
    );
    const dragTo = (translationX: number) => {
      pan().onBegin();
      pan().onStart();
      pan().onUpdate({ translationX });
    };

    dragTo(-50);
    pan().onFinalize({}, false);
    expect(offset()).toBe(-ACTION_W);

    dragTo(ACTION_W - 5); // back up to near-closed
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
      <SwipeToDelete onDelete={() => {}}>
        <Text>x</Text>
      </SwipeToDelete>,
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
