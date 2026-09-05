// Adapted from the web's src/screens/Home.test.tsx. Same behaviour, three
// mechanical differences: the store/router mocks are jest's, `window.confirm`
// is `Alert.alert` (PORTING §1 — the confirm branch runs in the destructive
// button's onPress), and the hero sparkline is stubbed so its presence can be
// asserted the way the web asserts on its test id.
import { Alert, View } from "react-native";
import { act, render, screen, fireEvent } from "@testing-library/react-native";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import posthog from "@/lib/posthog";
import type { Transaction } from "@/types/db";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Reanimated's own `react-native-reanimated/mock` pulls in the real module,
// whose worklets runtime isn't available off-device, so the animated pieces
// (SwipeRow, the category sheet) get plain React Native views instead. No JSX
// in the factory: nativewind's babel plugin would rewrite it into an
// out-of-scope import that jest refuses.
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
    useAnimatedScrollHandler: (fn: unknown) => fn,
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
// these tests drive (the Edit/Delete actions are plain buttons), so the
// detector just renders its children.
jest.mock("react-native-gesture-handler", () => {
  const RN = require("react-native");
  const chainable: unknown = new Proxy(
    {},
    { get: () => () => chainable },
  );
  return {
    __esModule: true,
    Gesture: new Proxy({}, { get: () => () => chainable }),
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: RN.View,
    Directions: {},
    State: {},
  };
});

// Home is the root of the native stack and re-reads the edit stash every time
// the page comes back into focus. The callback is kept so a test can re-fire it
// the way returning from the history page would.
let mockFocusEffect: (() => void) | null = null;
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    mockFocusEffect = cb;
    require("react").useEffect(cb, [cb]);
  },
}));

// The web's SparkArea carries data-testid="spark-area"; give the native one a
// testID so "is the spark drawn?" stays assertable. The stub is defined out
// here and called lazily — JSX inside a jest.mock factory doesn't compile.
const mockSparkArea = () => <View testID="spark-area" />;
jest.mock("@/components/ui/SparkArea", () => ({ SparkArea: () => mockSparkArea() }));

// A complete, overridable Store value — the web's @/test/storeValue.
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

import { Home } from "@/screens/Home";
import { requestEdit, takePendingEdit } from "@/lib/editIntent";

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

/** The destructive button of the last Alert.alert, invoked like a real tap. */
async function tapAlertButton(spy: jest.SpyInstance, text: string) {
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as {
    text?: string;
    onPress?: () => void | Promise<void>;
  }[];
  const button = buttons.find((b) => b.text === text);
  await button?.onPress?.();
}

describe("Home", () => {
  beforeEach(() => {
    mockStoreValue = makeStoreValue();
    takePendingEdit(); // drain any leftover intent between tests
  });

  it("shows the loading state before any transactions arrive", async () => {
    mockStoreValue = makeStoreValue({ loading: true, transactions: [] });
    await render(<Home />);
    expect(screen.getByText("Loading…")).toBeOnTheScreen();
  });

  it("shows obscured amounts and an unlock nudge when locked", async () => {
    mockStoreValue = makeStoreValue({
      locked: true,
      transactions: [
        tx({ amountMask: "a8F2", is_income: true, occurred_at: new Date().toISOString() }),
      ],
      monthlyNetCents: 0,
    });
    await render(<Home />);
    // Hero total obscured, the masked row amount shown, and a nudge to Settings.
    expect(screen.getByText("$•••••")).toBeOnTheScreen();
    expect(screen.getByText("+$a8F2")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(/enter your passphrase in Settings/i));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("can't reveal the safe balance while locked", async () => {
    mockStoreValue = makeStoreValue({ locked: true, safeTotalCents: 5000, safeGoldGrams: 2 });
    await render(<Home />);
    // The eye is disabled, so the balance stays obscured.
    await fireEvent.press(screen.getByLabelText("Show safe balance"));
    expect(screen.getByText("••••")).toBeOnTheScreen();
    expect(screen.queryByText("$50.00")).toBeNull();
  });

  it("keeps the safe balance hidden until revealed", async () => {
    mockStoreValue = makeStoreValue({ safeTotalCents: 5000, safeGoldGrams: 2 });
    await render(<Home />);
    expect(screen.getByText("••••")).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText("Show safe balance"));
    expect(screen.getByText("$50.00")).toBeOnTheScreen();
    expect(screen.getByText("2 g")).toBeOnTheScreen();
    // And hides again.
    await fireEvent.press(screen.getByLabelText("Hide safe balance"));
    expect(screen.getByText("••••")).toBeOnTheScreen();
  });

  it("tints the page when only gold is tucked away", async () => {
    mockStoreValue = makeStoreValue({ safeTotalCents: 0, safeGoldGrams: 4 });
    await render(<Home />);
    await fireEvent.press(screen.getByLabelText("Show safe balance"));
    expect(screen.getByText("4 g")).toBeOnTheScreen();
  });

  it("navigates to the safe and settings", async () => {
    await render(<Home />);
    await fireEvent.press(screen.getByLabelText("Settings"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
    await fireEvent.press(screen.getByLabelText("Safe"));
    expect(mockNavigate).toHaveBeenCalledWith("/safe");

    // The balance card itself is also a shortcut into the safe.
    mockNavigate.mockClear();
    await fireEvent.press(screen.getByText("In the safe"));
    expect(mockNavigate).toHaveBeenCalledWith("/safe");
  });

  it("enters edit mode and scrolls to the top", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [tx({ occurred_at: new Date().toISOString() })],
    });
    await render(<Home />);
    await fireEvent.press(screen.getByLabelText("Edit"));
    const cancel = screen.getByText("Cancel edit");
    expect(cancel).toBeOnTheScreen();

    // Cancelling clears edit mode (exercises Home's clearEdit handler).
    await fireEvent.press(cancel);
    expect(screen.queryByText("Cancel edit")).toBeNull();
  });

  it("deletes a row when confirmed, and not when cancelled", async () => {
    const row = tx({ occurred_at: new Date().toISOString() });
    mockStoreValue = makeStoreValue({ transactions: [row] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Home />);

    await fireEvent.press(screen.getByLabelText("Delete"));
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

  it("lists only today's entries inline, leaving older ones for the drawer", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [
        tx({ id: "today", category: "groceries", occurred_at: new Date().toISOString() }),
        tx({ id: "old", category: "gas", occurred_at: "2020-01-01T10:00:00.000Z" }),
      ],
    });
    await render(<Home />);
    expect(screen.getByText("Groceries")).toBeOnTheScreen();
    // The old "Gas" entry stays on the full-history page, not inline.
    expect(screen.queryByText("Gas")).toBeNull();
  });

  it("opens the stats page from the hero, with the spark washed behind it", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [tx({ occurred_at: new Date().toISOString() })],
    });
    await render(<Home />);
    expect(screen.getByTestId("spark-area")).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText("See your stats"));
    expect(mockNavigate).toHaveBeenCalledWith("/stats");
  });

  it("hides the hero spark while locked — masked zeros would chart a lie", async () => {
    mockStoreValue = makeStoreValue({ locked: true });
    await render(<Home />);
    expect(screen.queryByTestId("spark-area")).toBeNull();
  });

  it("navigates to the full-history page from Show all", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [tx({ id: "old", category: "gas", occurred_at: "2020-01-01T10:00:00.000Z" })],
    });
    await render(<Home />);
    await fireEvent.press(screen.getByText("Show all"));
    expect(mockNavigate).toHaveBeenCalledWith("/history");
  });

  it("picks up a pending edit requested from the history page", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [tx({ id: "t1", occurred_at: new Date().toISOString() })],
    });
    requestEdit("t1");
    await render(<Home />);
    // The composer opens in edit mode.
    expect(screen.getByText("Cancel edit")).toBeOnTheScreen();
  });

  it("picks up an edit stashed while it was away, on the way back", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [tx({ id: "t1", occurred_at: new Date().toISOString() })],
    });
    await render(<Home />);
    expect(screen.queryByText("Cancel edit")).toBeNull();

    // The history page stashes the target and navigates home; Home never
    // unmounts, so the stash is read again when the page regains focus.
    requestEdit("t1");
    await act(async () => {
      mockFocusEffect?.();
    });
    expect(screen.getByText("Cancel edit")).toBeOnTheScreen();
  });

  it("ignores a pending edit whose transaction is gone", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [tx({ id: "t1", occurred_at: new Date().toISOString() })],
    });
    requestEdit("missing");
    await render(<Home />);
    expect(screen.queryByText("Cancel edit")).toBeNull();
  });

  it("nudges to Show all when there's history but nothing today", async () => {
    mockStoreValue = makeStoreValue({
      transactions: [tx({ occurred_at: "2020-01-01T10:00:00.000Z" })],
    });
    await render(<Home />);
    expect(screen.getByText(/Nothin' today/)).toBeOnTheScreen();
    expect(screen.getByText("Show all")).toBeOnTheScreen();
  });

  it("invites a first entry when there's no history at all", async () => {
    await render(<Home />);
    expect(screen.getByText(/Nothin' here yet, Doc/)).toBeOnTheScreen();
    expect(screen.queryByText("Show all")).toBeNull();
  });
});
