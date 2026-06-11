import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import type { Transaction } from "@/types/db";
import type { PublicStats } from "@/lib/publicStats";
import type { CategoryStat, DayPoint, MonthInsights } from "@/lib/stats";

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

const fetchPublicStats = vi.fn();
vi.mock("@/lib/publicStats", () => ({
  fetchPublicStats: (...a: unknown[]) => fetchPublicStats(...a),
}));

// The aggregations are unit-tested in lib/stats.test.ts; mocking them here
// gives each rendering branch deterministic numbers regardless of today's date.
const dailySpendSeries = vi.fn();
const topCategories = vi.fn();
const monthInsights = vi.fn();
vi.mock("@/lib/stats", () => ({
  FETCH_CAP: 500,
  dailySpendSeries: (...a: unknown[]) => dailySpendSeries(...a),
  topCategories: (...a: unknown[]) => topCategories(...a),
  monthInsights: (...a: unknown[]) => monthInsights(...a),
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
      note: null,
      created_at: "2026-06-05T10:00:00.000Z",
    } as Transaction,
    busiestDay: { date: "2026-06-05", count: 2 },
    noSpendDays: 7,
    coffeeCount: 1,
    anyMasked: false,
    ...overrides,
  };
}

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

describe("Stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeValue = makeStoreValue();
    // Most tests don't care about the community section: leave it counting.
    fetchPublicStats.mockReturnValue(new Promise(() => {}));
    dailySpendSeries.mockReturnValue([point("2026-06-09", 0, 0), point("2026-06-10", 2000, 3)]);
    topCategories.mockReturnValue(CATS);
    monthInsights.mockReturnValue(insights());
  });

  it("shows the month's money picture when signed in", () => {
    render(<Stats signedIn />);
    expect(screen.getByText("Your Stats")).toBeInTheDocument();
    expect(screen.getByText(/Spent ·/)).toBeInTheDocument();
    expect(screen.getByText("$20.00")).toBeInTheDocument();
    expect(screen.getByText("≈ $2.00 a day")).toBeInTheDocument();
    expect(screen.getByTestId("spark-area")).toBeInTheDocument();

    // Category bars, biggest first.
    expect(screen.getByText("Where it goes")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("$7.00")).toBeInTheDocument();

    // Fun facts.
    expect(screen.getByText("Biggest splurge")).toBeInTheDocument();
    expect(screen.getAllByText("$10.00")).not.toHaveLength(0);
    expect(screen.getByText("2 entries")).toBeInTheDocument();
    expect(screen.getByText(/Jun 5/)).toBeInTheDocument();
    expect(screen.getByText("No-spend days")).toBeInTheDocument();
    expect(screen.getByText("Coffee runs")).toBeInTheDocument();
    expect(screen.getByText("+$50.00")).toBeInTheDocument();
    expect(screen.getByText("-$20.00")).toBeInTheDocument();
  });

  it("navigates back home", async () => {
    render(<Stats signedIn />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("shows the empty state before there's anything to chart", () => {
    dailySpendSeries.mockReturnValue([point("2026-06-09", 0, 0), point("2026-06-10", 0, 0)]);
    topCategories.mockReturnValue([]);
    monthInsights.mockReturnValue(
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
    render(<Stats signedIn />);
    expect(screen.getByText(/Nothin' to chart yet, Doc/)).toBeInTheDocument();
    expect(screen.queryByText("Where it goes")).not.toBeInTheDocument();
  });

  it("switches to counts and nudges to Settings while locked", async () => {
    storeValue = makeStoreValue({ locked: true });
    topCategories.mockReturnValue([
      { category: "coffee", totalCents: 0, count: 2, share: 0 },
      { category: "groceries", totalCents: 0, count: 1, share: 0 },
    ]);
    monthInsights.mockReturnValue(
      insights({ spentCents: 0, incomeCents: 0, anyMasked: true }),
    );
    render(<Stats signedIn />);

    // The headline counts entries instead of pretending zeros are money.
    expect(screen.getByText(/Entries ·/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("amounts locked")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getByText("×1")).toBeInTheDocument();

    // Money facts hidden; count facts stay.
    expect(screen.queryByText("Biggest splurge")).not.toBeInTheDocument();
    expect(screen.queryByText("In vs out")).not.toBeInTheDocument();
    expect(screen.getByText("Busiest day")).toBeInTheDocument();

    await userEvent.click(screen.getByText(/Enter your passphrase in Settings/));
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("masks money even when only the rows are flagged (belt and braces)", () => {
    monthInsights.mockReturnValue(insights({ anyMasked: true }));
    render(<Stats signedIn />);
    expect(screen.getByText("amounts locked")).toBeInTheDocument();
  });

  it("keeps the page useful when the window has data but the month doesn't", () => {
    // E.g. early in a new month: spending 3 weeks ago shows in the 30-day
    // chart, but there's nothing month-scoped to break down yet.
    dailySpendSeries.mockReturnValue([point("2026-06-01", 500, 1), point("2026-06-10", 0, 0)]);
    topCategories.mockReturnValue([]);
    monthInsights.mockReturnValue(
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
    render(<Stats signedIn />);
    expect(screen.getByText("Fun facts")).toBeInTheDocument();
    expect(screen.queryByText("Where it goes")).not.toBeInTheDocument();
    expect(screen.queryByText("Busiest day")).not.toBeInTheDocument();
    expect(screen.queryByText("In vs out")).not.toBeInTheDocument();
  });

  it("greets signed-out visitors with the teaser and the public title", async () => {
    render(<Stats signedIn={false} />);
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText(/Wabbits get their own spending picture/)).toBeInTheDocument();
    expect(screen.getByText("Counting carrots…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hop in" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("shows the community numbers once they arrive", async () => {
    fetchPublicStats.mockResolvedValue(COMMUNITY);
    render(<Stats signedIn={false} />);
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("3,400")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Wabbits")).toBeInTheDocument();
    expect(screen.getByText("Locked vaults")).toBeInTheDocument();
    expect(screen.getByText("What everyone logs most")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText(/Counts only, amounts are encrypted/)).toBeInTheDocument();
  });

  it("hides the category bars when the community list is empty", async () => {
    fetchPublicStats.mockResolvedValue({ ...COMMUNITY, topCategories: [] });
    render(<Stats signedIn={false} />);
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.queryByText("What everyone logs most")).not.toBeInTheDocument();
  });

  it("falls back quietly when the community stats can't be reached", async () => {
    fetchPublicStats.mockResolvedValue(null);
    render(<Stats signedIn={false} />);
    expect(
      await screen.findByText(/Couldn't reach the community stats/),
    ).toBeInTheDocument();
  });

  it("ignores a community response that lands after unmount", async () => {
    let resolve!: (v: PublicStats | null) => void;
    fetchPublicStats.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = render(<Stats signedIn={false} />);
    unmount();
    resolve(COMMUNITY);
    await Promise.resolve(); // flush — must not warn about unmounted setState
    expect(fetchPublicStats).toHaveBeenCalledTimes(1);
  });
});
