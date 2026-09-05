// Adapted from the web's src/components/HistoryStack.test.tsx, plus the two
// props the web has no need for: the full-history page virtualizes the list, so
// `open`/`onOpen`/`stackKey` let it own the open set instead of the stack.

// Reanimated's own mock pulls in the real module (which needs the worklets
// native module) and throws under jest, so this is the same shape by hand. The
// layout/entering animations are inert builders.
jest.mock("react-native-reanimated", () => {
  const { View, Text } = require("react-native");
  const builder: Record<string, unknown> = {};
  builder.duration = () => builder;
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (c: unknown) => c },
    Easing: { bezier: () => ({}) },
    runOnJS: (fn: unknown) => fn,
    useSharedValue: (v: unknown) => ({ value: v }),
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
import { HistoryStack } from "@/components/HistoryStack";
import { groupByCategory } from "@/lib/history";
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

function group(rows: Transaction[]) {
  return groupByCategory(rows)[0];
}

describe("HistoryStack", () => {
  it("renders a multi-entry group collapsed with a count and signed total", async () => {
    await render(
      <HistoryStack
        group={group([tx({ id: "a" }), tx({ id: "b" })])}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("2 entries")).toBeTruthy();
    expect(screen.getByText("-$25.00")).toBeTruthy();
    // Rows aren't rendered until the stack is opened.
    expect(screen.queryByLabelText("Edit")).toBeNull();
  });

  it("expands to one row per entry on tap", async () => {
    await render(
      <HistoryStack
        group={group([tx({ id: "a" }), tx({ id: "b" }), tx({ id: "c" })])}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Groceries, 3 entries"));
    expect(screen.getAllByLabelText("Edit")).toHaveLength(3);
    expect(screen.getAllByLabelText("Delete")).toHaveLength(3);
    // Opened stacks stay open, by design — the header is gone.
    expect(screen.queryByText("3 entries")).toBeNull();
  });

  it("renders a single-entry group as a plain row (no stack)", async () => {
    await render(
      <HistoryStack group={group([tx()])} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(screen.queryByText(/entries/)).toBeNull();
    expect(screen.getByLabelText("Edit")).toBeTruthy();
  });

  it("hides the numeric total when any entry is masked", async () => {
    await render(
      <HistoryStack
        group={group([tx({ id: "a", amountMask: "a8F2" }), tx({ id: "b" })])}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("-••••")).toBeTruthy();
    expect(screen.queryByText("-$25.00")).toBeNull();
  });

  it("keeps the sign when masking an income group", async () => {
    await render(
      <HistoryStack
        group={group([
          tx({ id: "a", is_income: true, category: "salary", amountMask: "a8F2" }),
          tx({ id: "b", is_income: true, category: "salary" }),
        ])}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("+••••")).toBeTruthy();
  });

  it("fires edit and delete from an expanded row", async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const rows = [tx({ id: "a" }), tx({ id: "b" })];
    await render(
      <HistoryStack group={group(rows)} onEdit={onEdit} onDelete={onDelete} />,
    );
    await fireEvent.press(screen.getByLabelText("Groceries, 2 entries"));
    await fireEvent.press(screen.getAllByLabelText("Edit")[0]);
    expect(onEdit).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getAllByLabelText("Delete")[0]);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("reports the open stack to a parent that owns the open set", async () => {
    const onOpen = jest.fn();
    await render(
      <HistoryStack
        group={group([tx({ id: "a" }), tx({ id: "b" })])}
        onEdit={() => {}}
        onDelete={() => {}}
        open={false}
        onOpen={onOpen}
        stackKey="day-1:false:groceries"
      />,
    );
    await fireEvent.press(screen.getByLabelText("Groceries, 2 entries"));
    expect(onOpen).toHaveBeenCalledWith("day-1:false:groceries");
    // The parent owns `open`, so the stack stays shut until it says otherwise.
    expect(screen.getByText("2 entries")).toBeTruthy();
  });

  it("falls back to the group's own key when no stackKey is given", async () => {
    const onOpen = jest.fn();
    await render(
      <HistoryStack
        group={group([tx({ id: "a" }), tx({ id: "b" })])}
        onEdit={() => {}}
        onDelete={() => {}}
        onOpen={onOpen}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Groceries, 2 entries"));
    expect(onOpen).toHaveBeenCalledWith("false:groceries");
  });

  it("renders already expanded when the parent mounts it open", async () => {
    await render(
      <HistoryStack
        group={group([tx({ id: "a" }), tx({ id: "b" })])}
        onEdit={() => {}}
        onDelete={() => {}}
        open
      />,
    );
    // A recycled cell that comes back open shows its rows straight away.
    expect(screen.getAllByLabelText("Edit")).toHaveLength(2);
    expect(screen.queryByText("2 entries")).toBeNull();
  });
});
