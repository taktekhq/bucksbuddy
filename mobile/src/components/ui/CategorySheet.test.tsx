// Adapted from the web's src/components/ui/CategorySheet.test.tsx — same nine
// behaviours (closed renders nothing, the grid + toggle, direct pick, drill in
// and pick parent or sub, back, the two active-chip states, the direction
// relay, the scrim, and drag-to-dismiss). The mobile port adds the mount/unmount
// dance that stands in for AnimatePresence, so the exit slide gets to play.

// `finished` decides whether the closing slide ran to completion; a slide that
// is interrupted must not unmount the sheet.
let mockTimingFinished = true;
// The style factories, so a test can read where the sheet and scrim sit.
const mockStyleFns: Array<() => Record<string, never>> = [];
// Reanimated's own mock pulls in the real module (which needs the worklets
// native module) and throws under jest, so this is the same shape by hand.
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
      mockStyleFns.push(fn as () => Record<string, never>);
      return fn();
    },
    withTiming: (to: unknown, _c: unknown, cb?: (finished: boolean) => void) => {
      cb?.(mockTimingFinished);
      return to;
    },
  };
});

// The recogniser is native; the builder records its callbacks so the tests can
// drive the sheet's own drag logic.
type MockGesture = { handlers: Record<string, (...a: unknown[]) => void> };
const mockGestures: MockGesture[] = [];
jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const build = () => {
    const g: Record<string, unknown> & { handlers: Record<string, unknown> } = {
      handlers: {},
    };
    g.activeOffsetY = () => g;
    for (const m of ["onUpdate", "onEnd"]) {
      g[m] = (fn: unknown) => {
        g.handlers[m] = fn;
        return g;
      };
    }
    return g;
  };
  return {
    Gesture: { Pan: build },
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: unknown }) => {
      mockGestures.push(gesture as MockGesture);
      return children;
    },
    GestureHandlerRootView: View,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

import { fireEvent, render, screen } from "@testing-library/react-native";
import { CategorySheet } from "@/components/ui/CategorySheet";

type Props = React.ComponentProps<typeof CategorySheet>;

function setup(props: Partial<Props> = {}) {
  const onChangeDirection = jest.fn();
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const element = (extra: Partial<Props> = {}) => (
    <CategorySheet
      open
      isIncome={false}
      selected={null}
      onChangeDirection={onChangeDirection}
      onSelect={onSelect}
      onClose={onClose}
      {...props}
      {...extra}
    />
  );
  return { element, onChangeDirection, onSelect, onClose };
}

/** Every measured container reports a size, as it would once laid out. */
async function measure(width = 320, height = 400) {
  const nodes = screen.container.queryAll(
    (n) => typeof n.props.onLayout === "function",
  );
  for (const node of nodes) {
    await fireEvent(node, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  }
}

/** How far down the sheet is translated. */
const sheetY = () =>
  (mockStyleFns[0]() as unknown as { transform: [{ translateY: number }] })
    .transform[0].translateY;
const drag = () => mockGestures[0].handlers;

beforeEach(() => {
  mockTimingFinished = true;
  mockStyleFns.length = 0;
  mockGestures.length = 0;
});

describe("CategorySheet", () => {
  it("renders nothing when closed", async () => {
    const { element } = setup();
    await render(element({ open: false }));
    expect(screen.toJSON()).toBeNull();
  });

  it("shows the grid and direction toggle when open", async () => {
    const { element } = setup();
    await render(element());
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Out")).toBeTruthy();
    expect(screen.getByText("In")).toBeTruthy();
    expect(sheetY()).toBe(0); // slid all the way up
  });

  it("offers the income categories when the direction is in", async () => {
    const { element } = setup({ isIncome: true });
    await render(element());
    expect(screen.getByText("Salary")).toBeTruthy();
    expect(screen.queryByText("Groceries")).toBeNull();
  });

  it("selects a category with no subcategories directly", async () => {
    const { element, onSelect } = setup();
    await render(element());
    await fireEvent.press(screen.getByText("Gas"));
    expect(onSelect).toHaveBeenCalledWith("gas");
  });

  it("drills into subcategories and can pick the parent or a sub", async () => {
    const { element, onSelect } = setup();
    await render(element());
    await fireEvent.press(screen.getByText("Health"));
    // Now on the subcategory step — the grid is gone.
    expect(screen.queryByText("Groceries")).toBeNull();
    await measure();

    await fireEvent.press(screen.getByText("Just Health"));
    expect(onSelect).toHaveBeenLastCalledWith("health");
    await fireEvent.press(screen.getByText("Pharmacy"));
    expect(onSelect).toHaveBeenLastCalledWith("health/pharmacy");
  });

  it("can go back from the subcategory step to the grid", async () => {
    const { element } = setup();
    await render(element());
    await fireEvent.press(screen.getByText("Health"));
    await fireEvent.press(screen.getByLabelText("Back to categories"));
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Out")).toBeTruthy();
  });

  it("marks the active parent and subcategory chips", async () => {
    const { element } = setup({ selected: "health/pharmacy" });
    await render(element());
    await fireEvent.press(screen.getByText("Health"));
    await measure();
    // The chosen sub is filled with the category color, the others tinted.
    expect(screen.getByText("Pharmacy").props.style).toMatchObject({
      color: "#FFFFFF",
    });
    expect(screen.getByText("Doctor").props.style).toMatchObject({
      color: "#FF375F",
    });
    expect(screen.getByText("Just Health").props.style).toMatchObject({
      color: "#FF375F",
    });
  });

  it("marks the bare-parent chip active when no sub is chosen", async () => {
    const { element } = setup({ selected: "health" });
    await render(element());
    await fireEvent.press(screen.getByText("Health"));
    expect(screen.getByText("Just Health").props.style).toMatchObject({
      color: "#FFFFFF",
    });
    expect(screen.getByText("Pharmacy").props.style).toMatchObject({
      color: "#FF375F",
    });
  });

  it("relays the direction toggle", async () => {
    const { element, onChangeDirection } = setup();
    await render(element());
    await fireEvent.press(screen.getByText("In"));
    expect(onChangeDirection).toHaveBeenCalledWith(true);
  });

  it("closes when the scrim is tapped", async () => {
    const { element, onClose } = setup();
    await render(element());
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on a downward drag past the threshold or with high velocity", async () => {
    const { element, onClose } = setup();
    await render(element());

    drag().onUpdate({ translationY: 100 });
    expect(sheetY()).toBeCloseTo(60, 5); // rubber-banded at 0.6
    drag().onUpdate({ translationY: -100 }); // dragging up doesn't move it
    expect(sheetY()).toBe(0);

    drag().onEnd({ translationY: 200, velocityY: 0 });
    expect(onClose).toHaveBeenCalledTimes(1);
    drag().onEnd({ translationY: 0, velocityY: 800 });
    expect(onClose).toHaveBeenCalledTimes(2);

    drag().onUpdate({ translationY: 50 });
    drag().onEnd({ translationY: 50, velocityY: 10 }); // not enough → snaps home
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(sheetY()).toBe(0);
  });

  it("slides out and unmounts once the exit animation finishes", async () => {
    const { element } = setup();
    const view = await render(element());
    await measure(320, 420); // the sheet measures itself on layout
    await view.rerender(element({ open: false }));
    expect(screen.toJSON()).toBeNull();
  });

  it("stays mounted when the exit animation is interrupted", async () => {
    const { element } = setup();
    const view = await render(element());
    await measure(320, 420);
    mockTimingFinished = false;
    await view.rerender(element({ open: false }));
    // Still on screen, slid down by its own height, ready to come back.
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(sheetY()).toBe(420);
  });

  it("always reopens on the grid step", async () => {
    const { element } = setup();
    const view = await render(element());
    await fireEvent.press(screen.getByText("Health"));
    expect(screen.getByText("Just Health")).toBeTruthy();

    mockTimingFinished = false; // keep it mounted so we can watch it reopen
    await view.rerender(element({ open: false }));
    await view.rerender(element({ open: true }));
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.queryByText("Just Health")).toBeNull();
  });
});
