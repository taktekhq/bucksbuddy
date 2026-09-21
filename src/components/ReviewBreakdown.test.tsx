import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReviewBreakdown } from "@/components/ReviewBreakdown";
import { buildDigest, daySpendSeries, type ReportWindow } from "@/lib/reportDigest";
import { detectRecurring, type RecurringSummary } from "@/lib/recurring";
import type { Transaction } from "@/types/db";

// Built through the local-time constructor, at noon, so local-day bucketing is
// deterministic in any timezone — the same rule reportDigest's own tests use.
const at = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m, d, h).toISOString();

let seq = 0;
function row(over: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: "u1",
    is_income: false,
    category: "other",
    amount_usd_cents: 100,
    original_currency: "USD",
    original_amount: 1,
    rate_used: 1,
    occurred_at: at(2026, 5, 1),
    note: null,
    created_at: at(2026, 5, 1),
    ...over,
  };
}
const out = (category: string, cents: number, occurred_at: string, note = null as string | null) =>
  row({ category, amount_usd_cents: cents, occurred_at, is_income: false, note });
const moneyIn = (category: string, cents: number, occurred_at: string) =>
  row({ category, amount_usd_cents: cents, occurred_at, is_income: true });

// June through August 2026, with a Netflix-shaped repeat, a Safe deposit and a
// withdrawal, and a part-covered final month.
const WINDOW: ReportWindow = {
  id: "last_3_months",
  from: new Date(2026, 5, 1),
  to: new Date(2026, 7, 16),
};
const ROWS: Transaction[] = [
  out("groceries/supermarket", 5000, at(2026, 5, 2)),
  out("groceries/supermarket", 6000, at(2026, 6, 2)),
  out("groceries/supermarket", 7000, at(2026, 7, 2)),
  out("food/restaurant", 2500, at(2026, 5, 3)),
  out("food/delivery", 3000, at(2026, 6, 3)),
  out("rent", 60000, at(2026, 5, 1)),
  out("gym", 4000, at(2026, 7, 4)), // August only — "new" against June
  out("fees/subscriptions", 1499, at(2026, 5, 5), "Netflix"),
  out("fees/subscriptions", 1499, at(2026, 6, 5), "Netflix"),
  out("fees/subscriptions", 1499, at(2026, 7, 5), "Netflix"),
  moneyIn("salary", 300000, at(2026, 5, 1)),
  out("safe", 20000, at(2026, 5, 6)),
  moneyIn("safe", 5000, at(2026, 5, 7)),
];

const DIGEST = buildDigest(ROWS, WINDOW, "USD");
const DAYS = daySpendSeries(ROWS, WINDOW);
const RECURRING = detectRecurring(ROWS, "u1", new Date(2026, 7, 16));

function show(over: Partial<Parameters<typeof ReviewBreakdown>[0]> = {}) {
  return render(
    <ReviewBreakdown
      digest={DIGEST}
      days={DAYS}
      recurring={RECURRING}
      homeCurrency="USD"
      {...over}
    />,
  );
}

describe("ReviewBreakdown — the window at a glance", () => {
  it("leads with what went out, over how long, and at what daily rate", () => {
    show();
    // The hero figure, and the same total again inside the month chart's
    // screen-reader labels — so this is legitimately more than one node.
    expect(screen.getAllByText(DIGEST.totals.spent.display).length).toBeGreaterThan(0);
    screen.getByText(
      `spent over ${DIGEST.period.days} days · ${DIGEST.totals.dailyAverage.display} a day`,
    );
    screen.getByText(DIGEST.period.label);
  });

  it("frames it with money in, what was left, and what was put away", () => {
    // Not what went out: that is the big figure above, and printing it twice
    // read as four totals instead of three.
    show();
    screen.getByText("In");
    screen.getByText("Left");
    screen.getByText("Put away");
    screen.getByText(DIGEST.totals.income.display);
    screen.getByText(DIGEST.totals.net.display);
    expect(screen.queryByText("Out")).toBeNull();
  });

  it("says a single day in the singular", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 2);
    const digest = buildDigest([out("groceries", 900, at(2026, 5, 1))], { id: "all_time", from, to }, "USD");
    show({ digest, days: daySpendSeries(ROWS, { id: "all_time", from, to }) });
    screen.getByText("spent over 1 day · $9.00 a day");
  });
});

describe("ReviewBreakdown — month by month", () => {
  it("charts every month in the window", () => {
    show();
    screen.getByRole("img", { name: "Spent per month" });
    screen.getByLabelText(/^June 2026: /);
    screen.getByLabelText(/^July 2026: /);
  });

  it("says plainly that the last month is unfinished, and at what rate it runs", () => {
    // Its bar is shorter because fewer days have happened, not because less was
    // spent — and a bar chart is read as a comparison regardless of the caption.
    show();
    const last = DIGEST.months[DIGEST.months.length - 1];
    screen.getByText(
      new RegExp(`${last.label} is ${last.days} days in.*${last.dailyAverage.display.replace("$", "\\$")} a day`),
    );
  });

  it("draws no chart at all for a single-month window", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 20);
    const digest = buildDigest(ROWS, { id: "all_time", from, to }, "USD");
    show({ digest });
    expect(screen.queryByRole("img", { name: "Spent per month" })).toBeNull();
  });
});

describe("ReviewBreakdown — where it went", () => {
  it("ranks the categories and says what the biggest one costs an entry", () => {
    show();
    screen.getByText("Where it went");
    // "Rent" is a category row here and a mover further down the page.
    expect(screen.getAllByText("Rent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Groceries").length).toBeGreaterThan(0);
    const top = DIGEST.categories[0];
    screen.getByText(
      `${top.label} is ${top.sharePct}% of everything spent, at ${top.averageEntry.display} an entry across ${top.count}.`,
    );
  });

  it("colours the bars by rank, never by category", () => {
    // A category's own colour would paint groceries in the exact green that
    // means money in, and fuel in the exact red that means money out. See
    // lib/reviewChart.
    show();
    const fills = Array.from(
      document.querySelectorAll('[style*="background-color: rgb(187, 220, 245)"]'),
    );
    expect(fills.length).toBeGreaterThan(0);
  });

  it("draws nothing when the window has no spending in it", () => {
    const from = new Date(2026, 9, 1);
    const to = new Date(2026, 9, 10);
    show({ digest: buildDigest([], { id: "all_time", from, to }, "USD") });
    expect(screen.queryByText("Where it went")).toBeNull();
  });
});

describe("ReviewBreakdown — saving", () => {
  it("totals the Safe on its own terms and says why it is separate", () => {
    show();
    screen.getByText("Saving");
    screen.getByText("Into the Safe");
    screen.getByText("$200.00");
    screen.getByText("Back out");
    // $50.00 is also the net put away in the hero, so both nodes are real.
    expect(screen.getAllByText("$50.00").length).toBe(2);
    screen.getByText("Net");
    screen.getByText(/Moving money to the Safe is a transfer/);
  });

  it("gives the share that reached the Safe and the share merely unspent", () => {
    show();
    const { savedSharePct, leftOverSharePct } = DIGEST.saving;
    screen.getByText(
      `${savedSharePct}% of what came in reached the Safe. ${leftOverSharePct}% went unspent — the gap is money that stayed in the open.`,
    );
  });

  it("refuses to take a share of an income that was never logged", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 10);
    const digest = buildDigest(
      [out("groceries", 5000, at(2026, 5, 2)), out("safe", 1000, at(2026, 5, 3))],
      { id: "all_time", from, to },
      "USD",
    );
    show({ digest });
    screen.getByText("No income logged in this window, so there is no share to take of it.");
  });

  it("stays away entirely from an account that has never used the Safe", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 10);
    const digest = buildDigest([out("groceries", 5000, at(2026, 5, 2))], { id: "all_time", from, to }, "USD");
    show({ digest });
    expect(screen.queryByText("Saving")).toBeNull();
  });
});

describe("ReviewBreakdown — fixed costs", () => {
  it("names the subscription, because the note never left this phone", () => {
    // The asymmetry that justifies this whole section: the digest carries no
    // note text, so the auditor can only say "a charge repeats in Fees". The
    // device typed the word "Netflix" and can say it.
    show();
    screen.getByText("Fixed costs");
    screen.getByText("Netflix");
    screen.getByText(/Detected from your own notes, which never leave this phone/);
  });

  it("says what the repeating payments cost a month between them", () => {
    show();
    screen.getByText(/1 repeating payment, \$14\.99 a month between them/);
  });

  it("shows a price that has risen, and what it was before", () => {
    const rows = [
      out("fees/subscriptions", 999, at(2026, 5, 5), "Spotify"),
      out("fees/subscriptions", 999, at(2026, 6, 5), "Spotify"),
      out("fees/subscriptions", 1299, at(2026, 7, 5), "Spotify"),
    ];
    show({ recurring: detectRecurring(rows, "u1", new Date(2026, 7, 16)) });
    screen.getByText(/was \$9\.99/);
  });

  it("says nothing while any amount on the device is still masked", () => {
    // A masked row carries zero, so every total here would be wrong rather
    // than merely incomplete.
    const masked: RecurringSummary = { ...RECURRING, anyMasked: true };
    show({ recurring: masked });
    expect(screen.queryByText("Fixed costs")).toBeNull();
  });

  it("says nothing when nothing repeats, and nothing when detection has not run", () => {
    const { unmount } = show({
      recurring: { payments: [], monthlyOutCents: 0, monthlyInCents: 0, anyMasked: false },
    });
    expect(screen.queryByText("Fixed costs")).toBeNull();
    unmount();
    show({ recurring: null });
    expect(screen.queryByText("Fixed costs")).toBeNull();
  });
});

describe("ReviewBreakdown — the edges of the copy", () => {
  it("says a one-day-old month in the singular, in both captions", () => {
    // A window that ends on the 2nd covers one day of that month.
    const window: ReportWindow = {
      id: "last_3_months",
      from: new Date(2026, 5, 1),
      to: new Date(2026, 6, 2),
    };
    const digest = buildDigest(
      [
        out("groceries", 5000, at(2026, 5, 2)),
        out("groceries", 900, at(2026, 6, 1)),
      ],
      window,
      "USD",
    );
    show({ digest, days: daySpendSeries(ROWS, window) });
    screen.getByText(/July 2026 is 1 day in/);
  });

  it("says nothing about an unfinished month when every month is whole", () => {
    const window: ReportWindow = {
      id: "last_3_months",
      from: new Date(2026, 5, 1),
      to: new Date(2026, 7, 1),
    };
    const digest = buildDigest(ROWS, window, "USD");
    show({ digest, days: daySpendSeries(ROWS, window) });
    screen.getByRole("img", { name: "Spent per month" });
    expect(screen.queryByText(/is hatched/)).toBeNull();
  });

  it("ranks several fixed costs by what they cost a month, and says so in the plural", () => {
    const rows = [
      out("fees/subscriptions", 499, at(2026, 5, 5), "Cheap thing"),
      out("fees/subscriptions", 499, at(2026, 6, 5), "Cheap thing"),
      out("fees/subscriptions", 499, at(2026, 7, 5), "Cheap thing"),
      // Not "Gym membership": lib/notes reads "membership" as the hint that a
      // charge recurs and strips it from the name.
      out("gym", 6000, at(2026, 5, 6), "Iron Temple"),
      out("gym", 6000, at(2026, 6, 6), "Iron Temple"),
      out("gym", 6000, at(2026, 7, 6), "Iron Temple"),
    ];
    show({ recurring: detectRecurring(rows, "u1", new Date(2026, 7, 16)) });
    screen.getByText(/2 repeating payments/);
    const names = screen
      .getByText("Fixed costs")
      .parentElement!.querySelectorAll("li span.truncate");
    expect([...names].map((n) => n.textContent)).toEqual([
      "Iron Temple",
      "Cheap thing",
    ]);
  });

  it("falls back to the category when a repeating charge was never named", () => {
    // Recurring detection works off the note; a series logged without one is
    // still a series, and the category is the only name it has.
    const rows = [
      out("gym", 6000, at(2026, 5, 6)),
      out("gym", 6000, at(2026, 6, 6)),
      out("gym", 6000, at(2026, 7, 6)),
    ];
    show({ recurring: detectRecurring(rows, "u1", new Date(2026, 7, 16)) });
    // Scoped to the panel: "Gym" is also a category row further up the page.
    const panel = screen.getByText("Fixed costs").parentElement!;
    within(panel).getByText("Gym");
  });
});

describe("ReviewBreakdown — what moved", () => {
  it("names the two whole months it compares, and says what it left out", () => {
    // The window runs to the 16th of August, so August is still running: the
    // comparison is June against July, and the caption has to say so rather
    // than let the reader assume it covers the window's own ends.
    show();
    screen.getByText("What moved");
    screen.getByText(
      /June 2026 against July 2026 — the two whole months in this window/,
    );
    screen.getByText(/A month that is still running is left out rather than scaled/);
    screen.getByText(/any months between these two are not in this list/);
  });

  it("shows each movement as a pair of totals, with no colour on it", () => {
    // Green and red mean money in and money out in this app, and a category
    // spending less is neither — nor necessarily good news.
    show();
    const move = DIGEST.monthOverMonth[0];
    const panel = screen.getByText("What moved").parentElement!;
    // The first row of the list, which is the biggest mover. Two categories can
    // legitimately move by the same percentage, so this is found by position.
    const [cell] = within(panel).getAllByText(
      move.changePct === null
        ? "new"
        : `${move.changePct > 0 ? "+" : ""}${move.changePct}%`,
    );
    expect(cell.className).toContain("text-review-text");
    expect(cell.getAttribute("style")).toBeNull();
    within(panel).getByText(`${move.first.display} → ${move.last.display}`);
  });

  it("names a category that did not exist in the first month as new", () => {
    const rows = [
      out("groceries/supermarket", 5000, at(2026, 5, 2)),
      out("groceries/supermarket", 5000, at(2026, 6, 2)),
      out("gym", 4000, at(2026, 6, 4)), // July only
    ];
    const window: ReportWindow = {
      id: "last_3_months",
      from: new Date(2026, 5, 1),
      to: new Date(2026, 7, 10),
    };
    show({ digest: buildDigest(rows, window, "USD"), days: daySpendSeries(rows, window) });
    screen.getByText("new");
  });

  it("draws nothing when only one month of the window has finished", () => {
    const window: ReportWindow = {
      id: "all_time",
      from: new Date(2026, 5, 1),
      to: new Date(2026, 6, 20),
    };
    show({ digest: buildDigest(ROWS, window, "USD") });
    expect(screen.queryByText("What moved")).toBeNull();
  });
});

describe("ReviewBreakdown — the biggest entries", () => {
  it("lists them with their dates and says what a typical one costs", () => {
    show();
    screen.getByText("Biggest single entries");
    screen.getByText("2026-06-01");
    screen.getByText(
      `Typical entry: ${DIGEST.totals.medianExpense.display}. Average: ${DIGEST.totals.averageExpense.display}.`,
    );
  });

  it("draws nothing when there is nothing to list", () => {
    const from = new Date(2026, 9, 1);
    const to = new Date(2026, 9, 10);
    show({ digest: buildDigest([], { id: "all_time", from, to }, "USD") });
    expect(screen.queryByText("Biggest single entries")).toBeNull();
  });
});

describe("ReviewBreakdown — logged on", () => {
  it("charts the week and says these are logging days, not spending days", () => {
    // occurred_at is stamped when an entry is TYPED — there is no date picker —
    // so this chart describes typing habits wearing the clothes of spending.
    show();
    screen.getByText("Logged on");
    screen.getByRole("img", { name: "Logged per weekday" });
    screen.getByText(
      new RegExp(`${DIGEST.weekendSharePct}% of it was logged at the weekend.*not necessarily the days money moved`),
    );
  });

  it("draws nothing for a week with nothing in it", () => {
    const from = new Date(2026, 9, 1);
    const to = new Date(2026, 9, 10);
    show({ digest: buildDigest([], { id: "all_time", from, to }, "USD") });
    expect(screen.queryByText("Logged on")).toBeNull();
  });
});

describe("ReviewBreakdown — how complete this is", () => {
  it("meters the days logged and names the two daily averages", () => {
    show();
    screen.getByText("How complete this is");
    screen.getByRole("progressbar", { name: "Days with entries" });
    screen.getByText(`${DIGEST.coverage.daysLogged}/${DIGEST.coverage.days}`);
    screen.getByText(
      new RegExp(
        `${DIGEST.totals.dailyAverage.display.replace("$", "\\$")} a day across every day, ${DIGEST.totals.perLoggedDayAverage.display.replace("$", "\\$")} across the days with entries`,
      ),
    );
  });

  it("names the busiest day of logging", () => {
    show();
    const busiest = DIGEST.coverage.busiestDay!;
    screen.getByText(
      new RegExp(`Busiest day of logging: ${busiest.date}, ${busiest.count} entr`),
    );
  });

  it("counts a busiest day of several in the plural", () => {
    // The main fixture has at most one entry on any day, so it only ever says
    // "1 entry". "1 entries" is the kind of thing nobody notices until it
    // ships, and so is its opposite.
    const digest = buildDigest(
      [
        out("groceries", 900, at(2026, 5, 2)),
        out("coffee", 400, at(2026, 5, 2)),
        out("food", 700, at(2026, 5, 3)),
      ],
      { id: "all_time", from: new Date(2026, 5, 1), to: new Date(2026, 5, 5) },
      "USD",
    );
    expect(digest.coverage.busiestDay?.count).toBe(2);
    show({ digest });
    screen.getByText(/Busiest day of logging: [\d-]+, 2 entries totalling/);
  });

  it("says so plainly when every day has something on it", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 3);
    const digest = buildDigest(
      [out("groceries", 900, at(2026, 5, 1)), out("coffee", 400, at(2026, 5, 2))],
      { id: "all_time", from, to },
      "USD",
    );
    show({ digest });
    screen.getByText(
      "Every day in the window has something logged, so nothing is missing from these figures.",
    );
  });

  it("says a one-day gap in the singular", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 4);
    const digest = buildDigest(
      [out("groceries", 900, at(2026, 5, 1)), out("coffee", 400, at(2026, 5, 3))],
      { id: "all_time", from, to },
      "USD",
    );
    show({ digest });
    screen.getByText(/longest stretch with nothing logged was 1 day —/);
  });
});
