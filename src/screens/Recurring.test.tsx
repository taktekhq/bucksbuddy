import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import type { Transaction } from "@/types/db";
import type { RecurringPayment, RecurringSummary } from "@/lib/recurring";

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

// The detection is unit-tested in lib/recurring.test.ts; mocking it here keeps
// the fixtures independent of today's date.
const detectRecurring = vi.fn();
vi.mock("@/lib/recurring", async () => ({
  ...(await vi.importActual<typeof import("@/lib/recurring")>("@/lib/recurring")),
  detectRecurring: (...a: unknown[]) => detectRecurring(...a),
}));

import { Recurring } from "@/screens/Recurring";

const USER = "8f14e45f-ceea-467a-9575-6f1c0f6b1a2c";

const row = (id: string, occurred_at: string, amount_usd_cents: number) =>
  ({ id, occurred_at, amount_usd_cents }) as unknown as Transaction;

function payment(overrides: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    key: "false:fees/subscriptions:netflix",
    category: "fees/subscriptions",
    isIncome: false,
    note: "Netflix",
    cadence: "monthly",
    fromNote: false,
    amountCents: 1599,
    previousAmountCents: null,
    monthlyCents: 1599,
    count: 3,
    firstAt: "2026-04-01T12:00:00.000Z",
    lastAt: "2026-06-01T12:00:00.000Z",
    nextDueAt: "2026-07-01T12:00:00.000Z",
    overdue: false,
    rows: [
      row("r3", "2026-06-01T12:00:00.000Z", 1599),
      row("r2", "2026-05-01T12:00:00.000Z", 1599),
      row("r1", "2026-04-01T12:00:00.000Z", 1599),
    ],
    ...overrides,
  };
}

function summary(overrides: Partial<RecurringSummary> = {}): RecurringSummary {
  return {
    payments: [],
    monthlyOutCents: 0,
    monthlyInCents: 0,
    anyMasked: false,
    ...overrides,
  };
}

// A mixed bag: two monthly outgoings in two categories, a yearly domain, a
// weekly income.
const MIXED: RecurringPayment[] = [
  payment(),
  payment({
    key: "false:work/subscriptions:claude",
    category: "work/subscriptions",
    note: "Claude",
    amountCents: 20000,
    monthlyCents: 20000,
    count: 4,
    nextDueAt: "2026-06-05T12:00:00.000Z",
    overdue: true,
  }),
  payment({
    key: "false:work/domains:sillyguy.com",
    category: "work/domains",
    note: "sillyguy.com",
    cadence: "yearly",
    fromNote: true,
    amountCents: 1868,
    monthlyCents: 156,
    count: 1,
    nextDueAt: "2027-06-08T12:00:00.000Z",
  }),
  payment({
    key: "true:freelance:retainer",
    category: "freelance",
    isIncome: true,
    note: "retainer",
    cadence: "weekly",
    amountCents: 10000,
    monthlyCents: 43333,
    count: 6,
    nextDueAt: "2026-06-15T12:00:00.000Z",
  }),
];

describe("Recurring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    storeValue = makeStoreValue();
    detectRecurring.mockReturnValue(summary());
  });

  it("scopes the detection to the given user id, without showing it", () => {
    const transactions = [row("x", "2026-06-01T12:00:00.000Z", 100)];
    storeValue = makeStoreValue({ transactions });
    render(<Recurring userId={USER} />);
    expect(detectRecurring).toHaveBeenCalledWith(transactions, USER);
    expect(screen.queryByText(/8f14e45f/)).not.toBeInTheDocument();
    expect(screen.getByText("Recurring")).toBeInTheDocument();
  });

  it("opens on the monthly side with the totals at zero", () => {
    render(<Recurring userId={USER} />);
    expect(screen.getByRole("tab", { name: "Monthly" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Nothin' monthly on repeat yet, Doc/)).toBeInTheDocument();
    expect(screen.getByText("Out per month")).toBeInTheDocument();
    expect(screen.getByText("In per month")).toBeInTheDocument();
    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.getAllByText("0 recurring")).toHaveLength(2);
  });

  it("shows the monthly side grouped by category, totalled per month", () => {
    detectRecurring.mockReturnValue(summary({ payments: MIXED }));
    render(<Recurring userId={USER} />);

    // Totals cover the monthly side only: Netflix + Claude out, the weekly
    // retainer in (normalised per month). The domain is on the other side.
    expect(screen.getByText("$215.99")).toBeInTheDocument();
    expect(screen.getByText("2 recurring")).toBeInTheDocument();
    expect(screen.getByText("$433.33")).toBeInTheDocument();
    expect(screen.getByText("1 recurring")).toBeInTheDocument();
    expect(screen.queryByText("sillyguy.com")).not.toBeInTheDocument();

    // Categories as blocks, biggest first, each with its own subtotal.
    const out = screen.getByText("Going out").parentElement!;
    const blocks = within(out).getAllByRole("region");
    expect(blocks.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Work · Subscriptions",
      "Fees · Subscriptions",
    ]);
    // The block subtotal and its only card read the same.
    expect(within(blocks[0]).getAllByText("-$200.00")).toHaveLength(2);
    expect(within(blocks[0]).getAllByText("per month")).toHaveLength(1);
    expect(within(blocks[0]).getByText("Claude")).toBeInTheDocument();
    expect(within(blocks[0]).getByText("Monthly · was due Jun 5")).toBeInTheDocument();
    expect(within(blocks[0]).getByText("4 times")).toBeInTheDocument();
    expect(within(blocks[1]).getByText("Netflix")).toBeInTheDocument();
    expect(within(blocks[1]).getByText("Monthly · next Jul 1")).toBeInTheDocument();
    expect(within(blocks[1]).getByText("3 times")).toBeInTheDocument();

    const income = screen.getByText("Coming in").parentElement!;
    expect(within(income).getByRole("region", { name: "Freelance" })).toBeInTheDocument();
    expect(within(income).getByText("+$433.33")).toBeInTheDocument(); // block subtotal
    expect(within(income).getByText("+$100.00")).toBeInTheDocument(); // per occurrence
    expect(within(income).getByText("Weekly · next Jun 15")).toBeInTheDocument();

    // Read-only: no edit/delete affordances anywhere.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("switches to the yearly side, totalled per year, and remembers it", async () => {
    detectRecurring.mockReturnValue(summary({ payments: MIXED }));
    render(<Recurring userId={USER} />);
    await userEvent.click(screen.getByRole("tab", { name: "Yearly" }));

    expect(screen.getByRole("tab", { name: "Yearly" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Out per year")).toBeInTheDocument();
    expect(screen.getByText("In per year")).toBeInTheDocument();
    expect(screen.getByText("$18.68")).toBeInTheDocument(); // the domain, per year
    expect(screen.getByText("1 recurring")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument(); // nothing yearly coming in
    expect(screen.getByRole("region", { name: "Work · Domains" })).toBeInTheDocument();
    expect(screen.getByText("sillyguy.com")).toBeInTheDocument();
    expect(screen.getByText("Yearly · next Jun 8")).toBeInTheDocument();
    expect(screen.getByText("1 time")).toBeInTheDocument();
    expect(screen.getByText("per year")).toBeInTheDocument();
    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();
    expect(screen.queryByText("Coming in")).not.toBeInTheDocument();
    expect(localStorage.getItem("bb-recurring-view")).toBe("yearly");
  });

  it("has its own empty line for the yearly side", async () => {
    detectRecurring.mockReturnValue(summary({ payments: [payment()] }));
    render(<Recurring userId={USER} />);
    await userEvent.click(screen.getByRole("tab", { name: "Yearly" }));
    expect(screen.getByText(/Nothin' yearly on repeat yet, Doc/)).toBeInTheDocument();
    expect(screen.getByText(/or a domain name in the note/)).toBeInTheDocument();
  });

  it("puts two series of one category in one block, subtotalled", () => {
    detectRecurring.mockReturnValue(
      summary({
        payments: [
          payment(),
          payment({ key: "false:fees/subscriptions:spotify", note: "Spotify", amountCents: 999, monthlyCents: 999 }),
        ],
      }),
    );
    render(<Recurring userId={USER} />);
    const block = screen.getByRole("region", { name: "Fees · Subscriptions" });
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(within(block).getByText("-$25.98")).toBeInTheDocument();
    expect(within(block).getByText("Netflix")).toBeInTheDocument();
    expect(within(block).getByText("Spotify")).toBeInTheDocument();
  });

  it("names a note-less series by its category", () => {
    detectRecurring.mockReturnValue(
      summary({ payments: [payment({ key: "false:rent:", category: "rent", note: null })] }),
    );
    render(<Recurring userId={USER} />);
    expect(screen.getByRole("button", { name: "Rent, monthly, 3 times" })).toBeInTheDocument();
  });

  it("shows the old price instead of the count after a price change", () => {
    detectRecurring.mockReturnValue(
      summary({ payments: [payment({ amountCents: 1799, previousAmountCents: 1599 })] }),
    );
    render(<Recurring userId={USER} />);
    expect(screen.getByText("-$17.99")).toBeInTheDocument(); // block subtotal and card share it
    expect(screen.getByText("was $15.99")).toBeInTheDocument();
    expect(screen.queryByText("3 times")).not.toBeInTheDocument();
  });

  it("opens a series to show its occurrences, and closes it again", async () => {
    detectRecurring.mockReturnValue(summary({ payments: [payment()] }));
    render(<Recurring userId={USER} />);
    const card = screen.getByRole("button", { name: "Netflix, monthly, 3 times" });
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Apr 1")).not.toBeInTheDocument();

    await userEvent.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Jun 1")).toBeInTheDocument();
    expect(screen.getByText("May 1")).toBeInTheDocument();
    expect(screen.getByText("Apr 1")).toBeInTheDocument();
    const occurrences = card.parentElement!.querySelector("ul")!;
    expect(within(occurrences).getAllByText("$15.99")).toHaveLength(3);

    await userEvent.click(card);
    expect(screen.queryByText("Apr 1")).not.toBeInTheDocument();
  });

  it("shows only the direction that has anything", () => {
    detectRecurring.mockReturnValue(
      summary({
        payments: [payment({ key: "true:salary:", category: "salary", isIncome: true, note: null })],
      }),
    );
    render(<Recurring userId={USER} />);
    expect(screen.getByText("Coming in")).toBeInTheDocument();
    expect(screen.queryByText("Going out")).not.toBeInTheDocument();
  });

  it("navigates back home", async () => {
    render(<Recurring userId={USER} />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("nudges to Settings instead of listing zeros while locked", async () => {
    storeValue = makeStoreValue({ locked: true });
    render(<Recurring userId={USER} />);
    expect(screen.getByText(/These entries are encrypted/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Monthly" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText(/Enter your passphrase in Settings/));
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("treats masked rows as locked (belt and braces)", () => {
    detectRecurring.mockReturnValue(summary({ anyMasked: true }));
    render(<Recurring userId={USER} />);
    expect(screen.getByText(/These entries are encrypted/)).toBeInTheDocument();
  });
});
