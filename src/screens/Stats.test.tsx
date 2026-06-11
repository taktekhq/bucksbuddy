import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import { monthLabel } from "@/lib/dates";
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
    weekendShare: 0.6,
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
    storeValue = makeStoreValue({ safeTotalCents: 90000 });
    render(<Stats signedIn />);
    expect(screen.getByText("Your Stats")).toBeInTheDocument();
    expect(screen.getByText(monthLabel())).toBeInTheDocument();
    expect(screen.getByText("$20.00")).toBeInTheDocument();
    expect(screen.getByText("≈ $2.00 a day")).toBeInTheDocument();
    expect(screen.getByTestId("spark-area")).toBeInTheDocument();

    // Category bars, biggest first.
    expect(screen.getByText("Where it goes")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("$7.00")).toBeInTheDocument();

    // Fun facts, in their paired order: the splurge carries its note, the
    // busiest day its total.
    expect(screen.getByText("Biggest splurge")).toBeInTheDocument();
    expect(screen.getAllByText("$10.00")).not.toHaveLength(0);
    expect(screen.getByText(/Food · Restaurant · fancy dinner/)).toBeInTheDocument();
    expect(screen.getByText("2 entries")).toBeInTheDocument();
    expect(screen.getByText(/Jun 5 · \$8\.00/)).toBeInTheDocument();
    // 90000 safe cents over the $2.00/day pace = 450 days ≈ 14.8 months.
    expect(screen.getByText("Safe runway")).toBeInTheDocument();
    expect(screen.getByText("14.8 months")).toBeInTheDocument();
    expect(screen.getByText("On pace for")).toBeInTheDocument();
    expect(screen.getByText("$60.00")).toBeInTheDocument();
    expect(screen.getByText("Treat yourself")).toBeInTheDocument();
    expect(screen.getByText("$9.50")).toBeInTheDocument();
    expect(screen.getByText("Coffee runs")).toBeInTheDocument();
    expect(screen.getByText("Weekend Spend")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("No-spend days")).toBeInTheDocument();
    expect(screen.getByText("+$50.00")).toBeInTheDocument();
    expect(screen.getByText("-$20.00")).toBeInTheDocument();

    // The chips follow the designed pairing order.
    const captions = screen
      .getAllByText(
        /^(Biggest splurge|Busiest day|Safe runway|On pace for|Treat yourself|Coffee runs|Weekend Spend|No-spend days)$/,
      )
      .map((el) => el.textContent);
    expect(captions).toEqual([
      "Biggest splurge",
      "Busiest day",
      "Safe runway",
      "On pace for",
      "Treat yourself",
      "Coffee runs",
      "Weekend Spend",
      "No-spend days",
    ]);
  });

  it("shows a short safe runway in days, not months (and singular at one)", () => {
    storeValue = makeStoreValue({ safeTotalCents: 200 });
    render(<Stats signedIn />);
    // 200 safe cents over the $2.00/day pace = 1 day — not "1 days".
    expect(screen.getByText("Safe runway")).toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeInTheDocument();
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

  it("veils personal stats in the user's own ciphertext while locked", async () => {
    const maskedTx = (id: string, amountMask?: string) =>
      ({ id, amountMask }) as unknown as Transaction;
    storeValue = makeStoreValue({
      locked: true,
      // The third row has no mask (e.g. still decrypting) — it's skipped.
      transactions: [maskedTx("t1", "a8F2"), maskedTx("t2", "x9Qd"), maskedTx("t3")],
    });
    render(<Stats signedIn />);

    // The page keeps its shape, but every personal number is a cipher
    // fragment borrowed from the masked rows — and no graphs render.
    expect(screen.getByText(monthLabel())).toBeInTheDocument();
    expect(screen.getByText("amounts locked")).toBeInTheDocument();
    expect(screen.getAllByText(/a8F2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/x9Qd/).length).toBeGreaterThan(0);
    expect(screen.getByText("Fun facts")).toBeInTheDocument();
    expect(screen.getByText("Biggest splurge")).toBeInTheDocument();
    expect(screen.getByText("Weekend Spend")).toBeInTheDocument();
    expect(screen.queryByTestId("spark-area")).not.toBeInTheDocument();
    expect(screen.queryByText("Where it goes")).not.toBeInTheDocument();
    expect(screen.queryByText("In vs out")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText(/Enter your passphrase in Settings/));
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("locks the page even when only the rows are flagged (belt and braces)", () => {
    // No masked rows in hand to borrow ciphertext from → dotted placeholders.
    monthInsights.mockReturnValue(insights({ anyMasked: true }));
    render(<Stats signedIn />);
    expect(screen.getByText(/Your stats are encrypted/)).toBeInTheDocument();
    expect(screen.getAllByText(/••••/).length).toBeGreaterThan(0);
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
        forecastCents: 0,
        biggestExpense: null,
        busiestDay: null,
        coffeeCount: 0,
        treatCents: 0,
        weekendShare: 0,
      }),
    );
    render(<Stats signedIn />);
    expect(screen.getByText("Fun facts")).toBeInTheDocument();
    expect(screen.queryByText("Where it goes")).not.toBeInTheDocument();
    expect(screen.queryByText("Busiest day")).not.toBeInTheDocument();
    expect(screen.queryByText("Safe runway")).not.toBeInTheDocument();
    expect(screen.queryByText("On pace for")).not.toBeInTheDocument();
    expect(screen.queryByText("Treat yourself")).not.toBeInTheDocument();
    expect(screen.queryByText("Weekend Spend")).not.toBeInTheDocument();
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
    expect(screen.getByText("E2EE")).toBeInTheDocument();
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
