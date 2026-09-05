// Adapted from the web's src/screens/History.test.tsx. Same behaviour; the
// differences are the port's: one virtualized SectionList instead of a mapped
// <main>, AsyncStorage instead of localStorage for the remembered grouping, and
// Alert.alert instead of window.confirm (PORTING §1).
import { Alert } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import posthog from "@/lib/posthog";
import type { Transaction } from "@/types/db";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Reanimated's own mock pulls in the real module, whose worklets runtime isn't
// available off-device. No JSX in the factory: nativewind's babel plugin would
// rewrite it into an out-of-scope import that jest refuses.
jest.mock("react-native-reanimated", () => {
  const RN = require("react-native");
  const animation = {
    duration: () => animation,
    delay: () => animation,
    springify: () => animation,
  };
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    ScrollView: RN.ScrollView,
    createAnimatedComponent: (Component: unknown) => Component,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    // The real hook hands the worklet the raw scroll event.
    useAnimatedScrollHandler:
      (fn: (e: unknown) => void) =>
      (event: { nativeEvent?: unknown }) =>
        fn(event?.nativeEvent ?? event),
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    runOnJS: (fn: unknown) => fn,
    Easing: { bezier: () => ({}) },
    FadeIn: animation,
    FadeOut: animation,
    LinearTransition: animation,
  };
});

// Gesture Handler needs a worklets runtime too; the swipe gestures aren't what
// these tests drive (the Edit/Delete actions are plain buttons).
jest.mock("react-native-gesture-handler", () => {
  const RN = require("react-native");
  const chainable: unknown = new Proxy({}, { get: () => () => chainable });
  return {
    __esModule: true,
    Gesture: new Proxy({}, { get: () => () => chainable }),
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: RN.View,
    Directions: {},
    State: {},
  };
});

function makeStoreValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    transactions: [] as Transaction[],
    lbpPerUsd: DEFAULT_LBP_PER_USD,
    balanceCents: 0,
    monthlyNetCents: 0,
    addTransaction: jest.fn(async () => ({ error: null })),
    updateTransaction: jest.fn(async () => ({ error: null })),
    deleteTransaction: jest.fn(async () => ({ error: null })),
    setRate: jest.fn(async () => ({ error: null })),
    e2eMode: "default",
    locked: false,
    passphrase: null,
    unlock: jest.fn(async () => ({ error: null })),
    enableEncryption: jest.fn(async () => ({ error: null })),
    disableEncryption: jest.fn(async () => ({ error: null })),
    signOut: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => ({ error: null })),
    safeTotalCents: 0,
    safeGoldEntries: [],
    safeGoldGrams: 0,
    addSafeGoldEntry: jest.fn(async () => ({ error: null })),
    deleteSafeGoldEntry: jest.fn(async () => ({ error: null })),
    refresh: jest.fn(async () => {}),
    ...overrides,
  };
}

let mockStoreValue = makeStoreValue();
jest.mock("@/lib/store", () => ({ useStore: () => mockStoreValue }));

const mockNavigate = jest.fn();
jest.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => mockNavigate(...a) }));

import { History } from "@/screens/History";
import { takePendingEdit } from "@/lib/editIntent";
import { monthLabel } from "@/lib/dates";

// Fixtures are anchored to the real clock rather than a frozen one, so the
// month-scoped "By category" view is deterministic whenever the suite runs.
const NOW = new Date();
const at = (monthOffset: number, day: number) =>
  new Date(NOW.getFullYear(), NOW.getMonth() + monthOffset, day, 12, 0, 0).toISOString();
const THIS_MONTH = monthLabel(new Date(NOW.getFullYear(), NOW.getMonth(), 1));
const LAST_MONTH = monthLabel(new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1));

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
    occurred_at: at(0, 1),
    note: null,
    created_at: at(0, 1),
    ...overrides,
  };
}

async function tapAlertButton(spy: jest.SpyInstance, text: string) {
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as {
    text?: string;
    onPress?: () => void | Promise<void>;
  }[];
  await buttons.find((b) => b.text === text)?.onPress?.();
}

describe("History", () => {
  beforeEach(() => {
    mockStoreValue = makeStoreValue();
    takePendingEdit(); // drain any leftover intent between tests
  });

  it("shows an empty message when there's no history", async () => {
    await render(<History />);
    expect(await screen.findByText("Nothin' here yet, Doc.")).toBeOnTheScreen();
    // No grouping toggle to show when there's nothing to group.
    expect(screen.queryByText("Timeline")).toBeNull();
  });

  it("defaults to the timeline view with a day total", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [
        tx({ id: "a", category: "gas", occurred_at: NOW.toISOString() }),
        tx({ id: "b", category: "coffee", occurred_at: at(0, 2) }),
      ],
    });
    await render(<History />);
    expect(screen.getByText("All History")).toBeOnTheScreen();
    // The tab is a real segmented control with a selected state.
    expect(
      await screen.findByRole("tab", { name: "Timeline", selected: true }),
    ).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "By category", selected: false })).toBeOnTheScreen();
    expect(screen.getByText("Today")).toBeOnTheScreen();
    expect(screen.getByText("Gas")).toBeOnTheScreen();
    expect(screen.getByText("Coffee")).toBeOnTheScreen();
  });

  it("switches to per-category stacks and remembers the choice", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [
        tx({ id: "a", category: "gas", occurred_at: at(0, 10) }),
        tx({ id: "b", category: "coffee", occurred_at: at(0, 12) }),
        tx({ id: "c", category: "coffee", occurred_at: at(0, 13) }),
      ],
    });
    const first = await render(<History />);
    await fireEvent.press(await screen.findByText("By category"));
    // Across-day coffee entries now merge into one stack.
    expect(screen.getByLabelText("Coffee, 2 entries")).toBeOnTheScreen();
    expect(screen.getByText("Gas")).toBeOnTheScreen();

    // The preference survives a remount.
    await first.unmount();
    await render(<History />);
    expect(
      await screen.findByRole("tab", { name: "By category", selected: true }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Coffee, 2 entries")).toBeOnTheScreen();
  });

  it("opens a stack to reveal its entries, and switching views folds them back", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [
        tx({ id: "b", category: "coffee", occurred_at: at(0, 12) }),
        tx({ id: "c", category: "coffee", occurred_at: at(0, 13) }),
      ],
    });
    await render(<History />);
    await fireEvent.press(await screen.findByText("By category"));
    const stack = screen.getByLabelText("Coffee, 2 entries");
    await fireEvent.press(stack);
    // Both entries are rows now, each with its own actions.
    expect(screen.getAllByLabelText("Edit")).toHaveLength(2);

    await fireEvent.press(screen.getByText("Timeline"));
    await fireEvent.press(screen.getByText("By category"));
    expect(screen.getByLabelText("Coffee, 2 entries")).toBeOnTheScreen();
  });

  it("scopes the category view to a month and pages between months", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [
        tx({ id: "this", category: "gas", occurred_at: at(0, 10) }),
        tx({ id: "prev", category: "coffee", occurred_at: at(-1, 12) }),
      ],
    });
    await render(<History />);
    await fireEvent.press(await screen.findByText("By category"));

    // Defaults to the current month: this month's gas shows, last month's
    // coffee doesn't.
    expect(screen.getByText(THIS_MONTH)).toBeOnTheScreen();
    expect(screen.getByText("Gas")).toBeOnTheScreen();
    expect(screen.queryByText("Coffee")).toBeNull();

    // Page back a month.
    await fireEvent.press(screen.getByLabelText("Previous month"));
    expect(screen.getByText(LAST_MONTH)).toBeOnTheScreen();
    expect(screen.getByText("Coffee")).toBeOnTheScreen();
    expect(screen.queryByText("Gas")).toBeNull();

    // Page forward again: back to this month, and capped at the present.
    await fireEvent.press(screen.getByLabelText("Next month"));
    expect(screen.getByText(THIS_MONTH)).toBeOnTheScreen();
    expect(screen.getByText("Gas")).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText("Next month"));
    expect(screen.getByText(THIS_MONTH)).toBeOnTheScreen();
  });

  it("shows an empty message in the category view for a quiet month", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [tx({ id: "prev", occurred_at: at(-1, 12) })],
    });
    await render(<History />);
    await fireEvent.press(await screen.findByText("By category"));
    expect(screen.getByText(THIS_MONTH)).toBeOnTheScreen();
    expect(screen.getByText("Nothin' logged this month, Doc.")).toBeOnTheScreen();
  });

  it("goes back home from the back button", async () => {
    await render(<History />);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("stashes the edit target and navigates home", async () => {
    mockStoreValue = makeStoreValue({ transactions: [tx({ id: "t1" })] });
    await render(<History />);
    await fireEvent.press(await screen.findByLabelText("Edit"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
    expect(takePendingEdit()).toBe("t1");
  });

  it("deletes a row when confirmed, and not when cancelled", async () => {
    mockStoreValue = makeStoreValue({ transactions: [tx({ id: "t1" })] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<History />);

    await fireEvent.press(await screen.findByLabelText("Delete"));
    expect(alert).toHaveBeenCalledWith("Delete this entry?", undefined, expect.any(Array));
    await tapAlertButton(alert, "Cancel");
    expect(mockStoreValue.deleteTransaction).not.toHaveBeenCalled();

    await tapAlertButton(alert, "Delete");
    expect(mockStoreValue.deleteTransaction).toHaveBeenCalledWith("t1");
    expect(posthog.capture).toHaveBeenCalledWith("transaction_deleted", {
      category: "groceries",
      is_income: false,
    });
    alert.mockRestore();
  });

  it("moves the gradient with the content as the page scrolls", async () => {
    mockStoreValue = makeStoreValue({ transactions: [tx({ id: "t1" })] });
    await render(<History />);
    await fireEvent.scroll(await screen.findByLabelText("Delete"), {
      contentOffset: { y: 120, x: 0 },
      contentSize: { height: 1000, width: 320 },
      layoutMeasurement: { height: 640, width: 320 },
    });
    // Nothing user-visible changes — the page just keeps rendering.
    expect(screen.getByText("All History")).toBeOnTheScreen();
  });
});
