// Adapted from the web's src/screens/Stats.test.tsx. The aggregations are
// mocked exactly as they are there, so every rendering branch gets
// deterministic numbers whatever today's date is. Two port-specific extras: the
// hero sparkline is stubbed so its presence stays assertable (the web asserts on
// its test id), and the fun-fact grid is measured with an onLayout pass, which
// is how React Native sizes a row that a browser sized with CSS grid.
import { View } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import { monthLabel } from "@/lib/dates";
import type { Transaction } from "@/types/db";
import type { PublicStats } from "@/lib/publicStats";
import type { CategoryStat, DayPoint, MonthInsights, MonthSpend } from "@/lib/stats";

// Rendering a whole screen (and the modules it drags in) can outrun jest's
// 5s default on a cold, loaded machine — see TESTING.md.
jest.setTimeout(30000);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The web's SparkArea carries data-testid="spark-area"; the native one gets a
// testID here. Defined out of the factory and called lazily — JSX inside a
// jest.mock factory doesn't compile (nativewind rewrites it).
const mockSparkArea = () => <View testID="spark-area" />;
jest.mock("@/components/ui/SparkArea", () => ({ SparkArea: () => mockSparkArea() }));

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
jest.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => (mockNavigate as (...x: unknown[]) => unknown)(...a) }));

const mockFetchPublicStats = jest.fn();
jest.mock("@/lib/publicStats", () => ({
  fetchPublicStats: (...a: unknown[]) => (mockFetchPublicStats as (...x: unknown[]) => unknown)(...a),
}));

// The aggregations are unit-tested in lib/stats.test.ts; mocking them here
// gives each rendering branch deterministic numbers regardless of today's date.
const mockDailySpendSeries = jest.fn();
const mockMonthSpendSeries = jest.fn();
const mockTopCategories = jest.fn();
const mockMonthInsights = jest.fn();
const mockMonthlySpendTotals = jest.fn();
jest.mock("@/lib/stats", () => ({
  FETCH_CAP: 500,
  dailySpendSeries: (...a: unknown[]) => (mockDailySpendSeries as (...x: unknown[]) => unknown)(...a),
  monthSpendSeries: (...a: unknown[]) => (mockMonthSpendSeries as (...x: unknown[]) => unknown)(...a),
  topCategories: (...a: unknown[]) => (mockTopCategories as (...x: unknown[]) => unknown)(...a),
  monthInsights: (...a: unknown[]) => (mockMonthInsights as (...x: unknown[]) => unknown)(...a),
  monthlySpendTotals: (...a: unknown[]) => (mockMonthlySpendTotals as (...x: unknown[]) => unknown)(...a),
}));

import { Stats } from "@/screens/Stats";

const point = (date: string, totalCents: number, count: number): DayPoint => ({
  date,
  totalCents,
  count,
});

function insights(overrides: Partial<MonthInsights> = {}): MonthInsights {
  return {
    spentCents: 2000,
    incomeCents: 5000,
    spendCount: 3,
    avgPerDayCents: 200,
    forecastCents: 6000,
    biggestExpense: {
      id: "big",
      user_id: "u1",
      is_income: false,
      category: "food/restaurant",
      amount_usd_cents: 1000,
      original_currency: "USD",
      original_amount: 10,
      rate_used: 89500,
      occurred_at: "2026-06-05T10:00:00.000Z",
      note: "fancy dinner",
      created_at: "2026-06-05T10:00:00.000Z",
    } as Transaction,
    busiestDay: { date: "2026-06-05", count: 2, totalCents: 800 },
    noSpendDays: 7,
    coffeeCount: 1,
    treatCents: 950,
    weekendCents: 1200,
    anyMasked: false,
    ...overrides,
  };
}

const month = (
  offset: number,
  totalCents: number,
  label: string,
  isCurrent = false,
): MonthSpend => ({ monthKey: `k${offset}`, label, totalCents, offset, isCurrent });

const CATS: CategoryStat[] = [
  { category: "food", totalCents: 1000, count: 1, share: 0.5 },
  { category: "groceries", totalCents: 700, count: 1, share: 0.35 },
  { category: "coffee", totalCents: 300, count: 1, share: 0.15 },
];

const COMMUNITY: PublicStats = {
  users: 12,
  transactions: 3400,
  encryptedUsers: 5,
  topCategories: [
    { category: "food", count: 120 },
    { category: "coffee", count: 80 },
  ],
};

/**
 * React Native has no CSS grid: the chip rows measure themselves with onLayout
 * and hand each chip its column width. A device does that automatically; here
 * the layout pass is fired by hand.
 */
async function measureGrids(width: number) {
  const grids = screen.container.queryAll(
    (node) => typeof node.props.onLayout === "function",
  );
  for (const grid of grids) {
    // The shell's KeyboardAvoidingView has an onLayout of its own now, and it
    // calls `event.persist()` like a real React event would; give it one.
    await fireEvent(grid, "layout", { nativeEvent: { layout: { width } }, persist() {} });
  }
  return grids.length;
}

describe("Stats", () => {
  beforeEach(() => {
    mockStoreValue = makeStoreValue();
    // Most tests don't care about the community section: leave it counting.
    mockFetchPublicStats.mockReturnValue(new Promise(() => {}));
    mockDailySpendSeries.mockReturnValue([
      point("2026-06-09", 0, 0),
      point("2026-06-10", 2000, 3),
    ]);
    mockMonthSpendSeries.mockReturnValue([
      point("2026-05-01", 0, 0),
      point("2026-05-31", 1500, 2),
    ]);
    mockTopCategories.mockReturnValue(CATS);
    mockMonthInsights.mockReturnValue(insights());
    // Most tests don't exercise the cross-month bars — leave them empty so the
    // "Spending by month" section stays out of the way.
    mockMonthlySpendTotals.mockReturnValue([]);
  });

  it("shows the month's money picture when signed in", async () => {
    mockStoreValue = makeStoreValue({ safeTotalCents: 90000 });
    await render(<Stats signedIn />);
    expect(screen.getByText("Your Stats")).toBeOnTheScreen();
    expect(screen.getByText(monthLabel())).toBeOnTheScreen();
    expect(screen.getByText("$20.00")).toBeOnTheScreen();
    expect(screen.getByText("≈ $2.00 a day")).toBeOnTheScreen();
    expect(screen.getByTestId("spark-area")).toBeOnTheScreen();

    // Category bars, biggest first.
    expect(screen.getByText("Where it goes")).toBeOnTheScreen();
    expect(screen.getByText("Food")).toBeOnTheScreen();
    expect(screen.getByText("Groceries")).toBeOnTheScreen();
    expect(screen.getByText("$7.00")).toBeOnTheScreen();

    // Fun facts, in their paired order: the splurge carries its note, the
    // busiest day its total.
    expect(screen.getByText("Biggest splurge")).toBeOnTheScreen();
    expect(screen.getAllByText("$10.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Food · Restaurant · fancy dinner/)).toBeOnTheScreen();
    expect(screen.getByText("2 entries")).toBeOnTheScreen();
    expect(screen.getByText(/Jun 5 · \$8\.00/)).toBeOnTheScreen();
    // 90000 safe cents over the $2.00/day pace = 450 days ≈ 14.8 months.
    expect(screen.getByText("Safe runway")).toBeOnTheScreen();
    expect(screen.getByText("14.8 months")).toBeOnTheScreen();
    expect(screen.getByText("On pace for")).toBeOnTheScreen();
    expect(screen.getByText("$60.00")).toBeOnTheScreen();
    expect(screen.getByText("Treat yourself")).toBeOnTheScreen();
    expect(screen.getByText("$9.50")).toBeOnTheScreen();
    expect(screen.getByText("Coffee runs")).toBeOnTheScreen();
    expect(screen.getByText("Weekend Spend")).toBeOnTheScreen();
    expect(screen.getByText("$12.00")).toBeOnTheScreen();
    expect(screen.getByText("No-spend days")).toBeOnTheScreen();
    expect(screen.getByText("+$50.00")).toBeOnTheScreen();
    expect(screen.getByText("-$20.00")).toBeOnTheScreen();

    // The chips follow the designed pairing order.
    const captions = screen
      .getAllByText(
        /^(Biggest splurge|Busiest day|Safe runway|On pace for|Treat yourself|Coffee runs|Weekend Spend|No-spend days)$/,
      )
      .map((el) => el.children[0]);
    expect(captions).toEqual([
      "Biggest splurge",
      "Busiest day",
      "Safe runway",
      "On pace for",
      "Treat yourself",
      "Weekend Spend",
      "Coffee runs",
      "No-spend days",
    ]);
  });

  it("sizes the fun-fact chips once the row has been measured", async () => {
    await render(<Stats signedIn />);
    expect(await measureGrids(320)).toBeGreaterThan(0);
    // A second, identical pass changes nothing; a zero-width one is ignored.
    await measureGrids(320);
    await measureGrids(0);
    expect(screen.getByText("Fun facts")).toBeOnTheScreen();
    expect(screen.getByText("In vs out")).toBeOnTheScreen();
  });

  it("opens the receipts pages from the tappable chips", async () => {
    await render(<Stats signedIn />);
    await fireEvent.press(screen.getByText("Treat yourself"));
    expect(mockNavigate).toHaveBeenCalledWith("/stats/treats");
    await fireEvent.press(screen.getByText("Weekend Spend"));
    expect(mockNavigate).toHaveBeenCalledWith("/stats/weekend");
  });

  it("shows a short safe runway in days, not months (and singular at one)", async () => {
    mockStoreValue = makeStoreValue({ safeTotalCents: 200 });
    await render(<Stats signedIn />);
    // 200 safe cents over the $2.00/day pace = 1 day — not "1 days".
    expect(screen.getByText("Safe runway")).toBeOnTheScreen();
    expect(screen.getByText("1 day")).toBeOnTheScreen();
  });

  it("navigates back home", async () => {
    await render(<Stats signedIn />);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("shows the empty state before there's anything to chart", async () => {
    mockDailySpendSeries.mockReturnValue([
      point("2026-06-09", 0, 0),
      point("2026-06-10", 0, 0),
    ]);
    mockTopCategories.mockReturnValue([]);
    mockMonthInsights.mockReturnValue(
      insights({
        spentCents: 0,
        incomeCents: 0,
        spendCount: 0,
        avgPerDayCents: 0,
        biggestExpense: null,
        busiestDay: null,
        coffeeCount: 0,
      }),
    );
    await render(<Stats signedIn />);
    expect(screen.getByText(/Nothin' to chart yet, Doc/)).toBeOnTheScreen();
    expect(screen.queryByText("Where it goes")).toBeNull();
  });

  it("shows a quiet-month message for a past month with nothing logged", async () => {
    mockDailySpendSeries.mockReturnValue([
      point("2026-06-09", 0, 0),
      point("2026-06-10", 0, 0),
    ]);
    mockMonthSpendSeries.mockReturnValue([
      point("2026-05-01", 0, 0),
      point("2026-05-31", 0, 0),
    ]);
    mockTopCategories.mockReturnValue([]);
    mockMonthInsights.mockReturnValue(
      insights({
        spentCents: 0,
        incomeCents: 0,
        spendCount: 0,
        biggestExpense: null,
        busiestDay: null,
      }),
    );
    mockStoreValue = makeStoreValue({
      transactions: [{ occurred_at: "2000-01-01T10:00:00.000Z" } as Transaction],
    });
    await render(<Stats signedIn />);
    await fireEvent.press(screen.getByLabelText("Previous month"));
    expect(screen.getByText(/Nothin' logged this month, Doc\./)).toBeOnTheScreen();
  });

  it("shows an em-dash for per-month and last-month when neither has spending", async () => {
    mockMonthlySpendTotals.mockReturnValue([
      month(-2, 0, "Apr"),
      month(-1, 0, "May"),
      month(0, 1000, "Jun", true),
    ]);
    await render(<Stats signedIn />);
    expect(screen.getByText("Spending by month")).toBeOnTheScreen();
    expect(screen.getByText("Per month")).toBeOnTheScreen();
    expect(screen.getByText("Last month")).toBeOnTheScreen();
    // Neither chip has anything behind it, so both wear an em-dash and the
    // "Last month" chip isn't tappable.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    await fireEvent.press(screen.getByText("Last month"));
    expect(screen.getByText("Spent this month")).toBeOnTheScreen();
  });

  it("veils personal stats in the user's own ciphertext while locked", async () => {
    const maskedTx = (id: string, amountMask?: string) =>
      ({ id, amountMask }) as unknown as Transaction;
    mockStoreValue = makeStoreValue({
      locked: true,
      // The third row has no mask (e.g. still decrypting) — it's skipped.
      transactions: [maskedTx("t1", "a8F2"), maskedTx("t2", "x9Qd"), maskedTx("t3")],
    });
    await render(<Stats signedIn />);

    // The page keeps its shape, but every personal number is a cipher
    // fragment borrowed from the masked rows — and no graphs render.
    expect(screen.getByText(monthLabel())).toBeOnTheScreen();
    expect(screen.getByText("amounts locked")).toBeOnTheScreen();
    expect(screen.getAllByText(/a8F2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/x9Qd/).length).toBeGreaterThan(0);
    expect(screen.getByText("Fun facts")).toBeOnTheScreen();
    expect(screen.getByText("Biggest splurge")).toBeOnTheScreen();
    expect(screen.getByText("Weekend Spend")).toBeOnTheScreen();
    expect(screen.queryByTestId("spark-area")).toBeNull();
    expect(screen.queryByText("Where it goes")).toBeNull();
    expect(screen.queryByText("In vs out")).toBeNull();

    await fireEvent.press(screen.getByText(/Enter your passphrase in Settings/));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("locks the page even when only the rows are flagged (belt and braces)", async () => {
    // No masked rows in hand to borrow ciphertext from → dotted placeholders.
    mockMonthInsights.mockReturnValue(insights({ anyMasked: true }));
    await render(<Stats signedIn />);
    expect(screen.getByText(/Your stats are encrypted/)).toBeOnTheScreen();
    expect(screen.getAllByText(/••••/).length).toBeGreaterThan(0);
  });

  it("keeps the page useful when the window has data but the month doesn't", async () => {
    // E.g. early in a new month: spending 3 weeks ago shows in the 30-day
    // chart, but there's nothing month-scoped to break down yet.
    mockDailySpendSeries.mockReturnValue([
      point("2026-06-01", 500, 1),
      point("2026-06-10", 0, 0),
    ]);
    mockTopCategories.mockReturnValue([]);
    mockMonthInsights.mockReturnValue(
      insights({
        spentCents: 0,
        incomeCents: 0,
        spendCount: 0,
        avgPerDayCents: 0,
        forecastCents: 0,
        biggestExpense: null,
        busiestDay: null,
        coffeeCount: 0,
        treatCents: 0,
        weekendCents: 0,
      }),
    );
    await render(<Stats signedIn />);
    expect(screen.getByText("Fun facts")).toBeOnTheScreen();
    expect(screen.queryByText("Where it goes")).toBeNull();

    // Every fun-fact chip still shows even with nothing behind it — a chip with
    // no data wears an em-dash rather than vanishing and leaving a hole.
    expect(screen.getByText("Biggest splurge")).toBeOnTheScreen();
    expect(screen.getByText("Busiest day")).toBeOnTheScreen();
    expect(screen.getByText("Safe runway")).toBeOnTheScreen();
    expect(screen.getByText("On pace for")).toBeOnTheScreen();
    expect(screen.getByText("Treat yourself")).toBeOnTheScreen();
    expect(screen.getByText("Weekend Spend")).toBeOnTheScreen();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    // The empty treat/weekend chips have no receipts behind them, so they're
    // not tappable.
    await fireEvent.press(screen.getByText("Treat yourself"));
    await fireEvent.press(screen.getByText("Weekend Spend"));
    expect(mockNavigate).not.toHaveBeenCalled();

    // The in-vs-out bar is a chart, not a fun fact — it stays hidden with no flow.
    expect(screen.queryByText("In vs out")).toBeNull();
  });

  it("charts spending by month with typical-month and last-month readouts", async () => {
    mockMonthlySpendTotals.mockReturnValue([
      month(-2, 3000, "Apr"),
      month(-1, 5000, "May"),
      month(0, 1000, "Jun", true),
    ]);
    await render(<Stats signedIn />);
    expect(screen.getByText("Spending by month")).toBeOnTheScreen();
    // Typical month = average of the completed months (Apr $30 + May $50) = $40.
    expect(screen.getByText("Per month")).toBeOnTheScreen();
    expect(screen.getByText("$40.00")).toBeOnTheScreen();
    // Last month is May.
    expect(screen.getByText("Last month")).toBeOnTheScreen();
    expect(screen.getByText("$50.00")).toBeOnTheScreen();
    // The bars are month pickers with accessible amounts.
    expect(screen.getByLabelText("May: $50.00")).toBeOnTheScreen();
  });

  it("pages the whole screen to a month by tapping its bar, and back with Next", async () => {
    mockMonthlySpendTotals.mockReturnValue([
      month(-2, 3000, "Apr"),
      month(-1, 5000, "May"),
      month(0, 1000, "Jun", true),
    ]);
    await render(<Stats signedIn />);

    expect(screen.getByText("Spent this month")).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText("May: $50.00"));
    // Tapping a bar pages straight there, bypassing the prev/next constraints.
    expect(screen.queryByText("Spent this month")).toBeNull();
    expect(screen.getByText("Spent")).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText("Next month"));
    expect(screen.getByText("Spent this month")).toBeOnTheScreen();
    // Capped at the present: Next is inert once back on the current month.
    await fireEvent.press(screen.getByLabelText("Next month"));
    expect(screen.getByText("Spent this month")).toBeOnTheScreen();
  });

  it("jumps to last month from the Last month fact chip", async () => {
    mockMonthlySpendTotals.mockReturnValue([
      month(-2, 3000, "Apr"),
      month(-1, 5000, "May"),
      month(0, 1000, "Jun", true),
    ]);
    await render(<Stats signedIn />);
    await fireEvent.press(screen.getByText("Last month"));
    expect(screen.queryByText("Spent this month")).toBeNull();
    expect(screen.getByText("Spent")).toBeOnTheScreen();
  });

  it("pages to a past month, dropping the present-tense facts", async () => {
    // A far-past transaction makes "Previous month" reachable (the nav reads the
    // real, unmocked dates off the store).
    mockStoreValue = makeStoreValue({
      transactions: [{ occurred_at: "2000-01-01T10:00:00.000Z" } as Transaction],
      safeTotalCents: 90000,
    });
    await render(<Stats signedIn />);

    // Current month: the forecast shows and the headline says "this month".
    expect(screen.getByText("Spent this month")).toBeOnTheScreen();
    expect(screen.getByText("$60.00")).toBeOnTheScreen(); // On pace for

    await fireEvent.press(screen.getByLabelText("Previous month"));

    // Past month: no forecast, no "this month", and the receipt chips go inert.
    expect(screen.queryByText("Spent this month")).toBeNull();
    expect(screen.getByText("Spent")).toBeOnTheScreen();
    expect(screen.queryByText("$60.00")).toBeNull();
    mockNavigate.mockClear();
    await fireEvent.press(screen.getByText("Treat yourself"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("greets signed-out visitors with the teaser and the public title", async () => {
    await render(<Stats signedIn={false} />);
    expect(screen.getByText("Stats")).toBeOnTheScreen();
    expect(screen.getByText(/Wabbits get their own spending picture/)).toBeOnTheScreen();
    expect(screen.getByText("Counting carrots…")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Hop in"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("shows the community numbers once they arrive", async () => {
    mockFetchPublicStats.mockResolvedValue(COMMUNITY);
    await render(<Stats signedIn={false} />);
    expect(await screen.findByText("12")).toBeOnTheScreen();
    expect(screen.getByText("3,400")).toBeOnTheScreen();
    expect(screen.getByText("5")).toBeOnTheScreen();
    expect(screen.getByText("Wabbits")).toBeOnTheScreen();
    expect(screen.getByText("E2EE")).toBeOnTheScreen();
    expect(screen.getByText("What everyone logs most")).toBeOnTheScreen();
    expect(screen.getByText("Food")).toBeOnTheScreen();
    expect(screen.getByText("120")).toBeOnTheScreen();
    expect(screen.getByText(/Counts only, amounts are encrypted/)).toBeOnTheScreen();
  });

  it("hides the category bars when the community list is empty", async () => {
    mockFetchPublicStats.mockResolvedValue({ ...COMMUNITY, topCategories: [] });
    await render(<Stats signedIn={false} />);
    expect(await screen.findByText("12")).toBeOnTheScreen();
    expect(screen.queryByText("What everyone logs most")).toBeNull();
  });

  it("falls back quietly when the community stats can't be reached", async () => {
    mockFetchPublicStats.mockResolvedValue(null);
    await render(<Stats signedIn={false} />);
    expect(await screen.findByText(/Couldn't reach the community stats/)).toBeOnTheScreen();
  });

  it("ignores a community response that lands after unmount", async () => {
    let resolve!: (v: PublicStats | null) => void;
    mockFetchPublicStats.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = await render(<Stats signedIn={false} />);
    await view.unmount();
    await act(async () => {
      resolve(COMMUNITY); // must not warn about setState after unmount
    });
    expect(mockFetchPublicStats).toHaveBeenCalledTimes(1);
  });
});
