// Adapted from the web's src/components/HistoryTimeline.test.tsx. The web
// asserts the day total's color class; class names don't survive into the
// rendered tree here, so these assert what the day header actually shows —
// the label, the signed total, the mask — and the two pieces the web has no
// equivalent for (`toSections` / `DayHeader`, which the virtualized
// full-history page feeds to a SectionList instead of mapping over days).

// Reanimated's own mock pulls in the real module (which needs the worklets
// native module) and throws under jest, so this is the same shape by hand.
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const builder: Record<string, unknown> = {};
  builder.duration = () => builder;
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
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (to: unknown) => to,
    FadeIn: builder,
    LinearTransition: builder,
  };
});

// Gesture recognition is native; the rows' own gesture logic is covered in
// SwipeRow.test.tsx, so here the detector just renders its children.
jest.mock("react-native-gesture-handler", () => {
  const build = () => {
    const g: Record<string, unknown> = {};
    for (const m of [
      "activeOffsetX",
      "failOffsetY",
      "onBegin",
      "onStart",
      "onUpdate",
      "onEnd",
      "onFinalize",
    ]) {
      g[m] = () => g;
    }
    return g;
  };
  return {
    Gesture: { Pan: build, Tap: build, Race: () => ({}) },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import { DayHeader, toSections } from "@/components/HistoryTimeline";
import { groupByCategory } from "@/lib/history";
import type { TimelineDay } from "@/lib/history";
import type { Transaction } from "@/types/db";

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

function day(overrides: Partial<TimelineDay> = {}): TimelineDay {
  return {
    key: "2026-06-01",
    label: "Jun 1",
    totalCents: -1250,
    masked: false,
    groups: groupByCategory([tx()]),
    ...overrides,
  };
}

describe("DayHeader", () => {
  // History feeds these two to a SectionList rather than rendering a
  // composition, so they are what the app depends on.
  it("shows the day's label and its signed total", async () => {
    await render(<DayHeader day={day()} />);
    expect(screen.getByText("Jun 1")).toBeOnTheScreen();
    expect(screen.getByText("-$12.50")).toBeOnTheScreen();
  });

  it("masks the total when any row on that day is obscured", async () => {
    await render(<DayHeader day={day({ masked: true })} />);
    expect(screen.getByText("••••")).toBeOnTheScreen();
    expect(screen.queryByText("-$12.50")).toBeNull();
  });

  it("shows a zero day without colouring it green or red", async () => {
    await render(<DayHeader day={day({ totalCents: 0 })} />);
    expect(screen.getByText("$0.00")).toBeOnTheScreen();
  });
});

describe("toSections", () => {
  it("turns days into sections, flagging only the first", () => {
    const sections = toSections([day(), day({ key: "2026-06-02", label: "Jun 2" })]);
    expect(sections.map((x) => x.first)).toEqual([true, false]);
    expect(sections[0].data).toBe(sections[0].groups);
  });
});
