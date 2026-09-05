// Adapted from the web's src/components/HistoryList.test.tsx. The swipe
// mechanics moved into SwipeRow on mobile (and are covered there), so what is
// left here is the list itself: the empty state, one row per transaction, and
// the callbacks reaching the right transaction.

// Reanimated's own mock pulls in the real module (which needs the worklets
// native module) and throws under jest, so this is the same shape by hand.
jest.mock("react-native-reanimated", () => {
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (c: unknown) => c },
    Easing: { bezier: () => ({}) },
    runOnJS: (fn: unknown) => fn,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (to: unknown) => to,
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
import { HistoryList } from "@/components/HistoryList";
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

describe("HistoryList", () => {
  it("shows the empty state with no rows", async () => {
    await render(<HistoryList rows={[]} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/Nothin' here yet/)).toBeTruthy();
  });

  it("renders one row per transaction", async () => {
    await render(
      <HistoryList
        rows={[
          tx({ id: "a", note: "Milk" }),
          tx({ id: "b", category: "salary", is_income: true, amount_usd_cents: 5000 }),
        ]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.queryByText(/Nothin' here yet/)).toBeNull();
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Milk")).toBeTruthy();
    expect(screen.getByText("-$12.50")).toBeTruthy();
    expect(screen.getByText("Salary")).toBeTruthy();
    expect(screen.getByText("+$50.00")).toBeTruthy();
  });

  it("fires edit and delete with the row that was acted on", async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const first = tx({ id: "a" });
    const second = tx({ id: "b", category: "gas" });
    await render(
      <HistoryList rows={[first, second]} onEdit={onEdit} onDelete={onDelete} />,
    );
    await fireEvent.press(screen.getAllByLabelText("Edit")[0]);
    expect(onEdit).toHaveBeenCalledWith(first);
    await fireEvent.press(screen.getAllByLabelText("Delete")[1]);
    expect(onDelete).toHaveBeenCalledWith(second);
  });
});
