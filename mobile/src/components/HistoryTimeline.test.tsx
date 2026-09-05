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
import { DayHeader, HistoryTimeline, toSections } from "@/components/HistoryTimeline";
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

describe("HistoryTimeline", () => {
  it("renders a day header and its entries", async () => {
    await render(
      <HistoryTimeline days={[day()]} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByRole("header", { name: "Jun 1" })).toBeTruthy();
    // The day's net, and the one entry that makes it up.
    expect(screen.getAllByText("-$12.50")).toHaveLength(2);
    expect(screen.getByText("Groceries")).toBeTruthy();
  });

  it("renders every day, each with its own entries", async () => {
    const days = [
      day({
        key: "2026-06-02",
        label: "Jun 2",
        totalCents: 5000,
        groups: groupByCategory([
          tx({ id: "a", is_income: true, category: "salary", amount_usd_cents: 5000 }),
        ]),
      }),
      day({ key: "2026-06-01", label: "Jun 1" }),
    ];
    await render(
      <HistoryTimeline days={days} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByRole("header", { name: "Jun 2" })).toBeTruthy();
    expect(screen.getByText("$50.00")).toBeTruthy(); // Jun 2's net
    expect(screen.getByText("+$50.00")).toBeTruthy(); // its one entry
    expect(screen.getByRole("header", { name: "Jun 1" })).toBeTruthy();
    expect(screen.getAllByText("-$12.50")).toHaveLength(2);
    expect(screen.getAllByLabelText("Edit")).toHaveLength(2);
  });

  it("passes edit and delete down to the rows", async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const row = tx();
    await render(
      <HistoryTimeline
        days={[day({ groups: groupByCategory([row]) })]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(row);
    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(row);
  });

  it("renders an even day's zero total plainly", async () => {
    await render(<DayHeader day={day({ totalCents: 0 })} />);
    expect(screen.getByText("$0.00")).toBeTruthy();
  });

  it("shows a positive day's total with no minus", async () => {
    await render(<DayHeader day={day({ totalCents: 9900 })} />);
    expect(screen.getByText("$99.00")).toBeTruthy();
  });

  it("masks the day total when any entry is obscured", async () => {
    await render(<DayHeader day={day({ totalCents: 1250, masked: true })} />);
    expect(screen.getByText("••••")).toBeTruthy();
    expect(screen.queryByText("$12.50")).toBeNull();
  });

  it("survives a day total that isn't a number", async () => {
    // The only input that reaches the neutral fallback in this file's local
    // copy of netColorClass: the header short-circuits on `=== 0`, so a real
    // zero never gets there. See the note in the port's review — the web
    // imports netColorClass from lib/money instead of copying it.
    await render(<DayHeader day={day({ totalCents: Number.NaN })} />);
    expect(screen.getByText("$NaN")).toBeTruthy();
  });

  it("turns days into sections, flagging only the first", () => {
    const days = [day({ key: "a" }), day({ key: "b" })];
    const sections = toSections(days);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ key: "a", first: true, data: days[0].groups });
    expect(sections[1]).toMatchObject({ key: "b", first: false, data: days[1].groups });
  });
});
