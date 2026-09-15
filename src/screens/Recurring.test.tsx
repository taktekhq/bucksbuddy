import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("Recurring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeValue = makeStoreValue();
    detectRecurring.mockReturnValue(summary());
  });

  it("scopes the detection to the given user id and says whose it is", () => {
    const transactions = [row("x", "2026-06-01T12:00:00.000Z", 100)];
    storeValue = makeStoreValue({ transactions });
    render(<Recurring userId={USER} />);
    expect(detectRecurring).toHaveBeenCalledWith(transactions, USER);
    expect(screen.getByText("8f14e45f")).toBeInTheDocument();
    expect(screen.getByText("Recurring")).toBeInTheDocument();
  });

  it("shows the empty state with the monthly totals at zero", () => {
    render(<Recurring userId={USER} />);
    expect(screen.getByText(/Nothin' on repeat yet, Doc/)).toBeInTheDocument();
    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.getAllByText("0 recurring")).toHaveLength(2);
  });

  it("lists outgoings and income with cadence, next due and typical amount", () => {
    detectRecurring.mockReturnValue(
      summary({
        payments: [
          payment(),
          payment({
            key: "false:rent:",
            category: "rent",
            note: null,
            amountCents: 80000,
            monthlyCents: 80000,
            count: 4,
            nextDueAt: "2026-06-05T12:00:00.000Z",
            overdue: true,
          }),
          payment({
            key: "true:salary:",
            category: "salary",
            isIncome: true,
            note: null,
            cadence: "biweekly",
            amountCents: 150000,
            monthlyCents: 325000,
            count: 6,
            nextDueAt: "2026-06-15T12:00:00.000Z",
          }),
        ],
        monthlyOutCents: 81599,
        monthlyInCents: 325000,
      }),
    );
    render(<Recurring userId={USER} />);

    expect(screen.getByText("$815.99")).toBeInTheDocument();
    expect(screen.getByText("2 recurring")).toBeInTheDocument();
    expect(screen.getByText("$3,250.00")).toBeInTheDocument();
    expect(screen.getByText("1 recurring")).toBeInTheDocument();
    expect(screen.getByText("Going out")).toBeInTheDocument();
    expect(screen.getByText("Coming in")).toBeInTheDocument();

    // A noted series is named by its note, with the category underneath.
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Fees · Subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Monthly · next Jul 1")).toBeInTheDocument();
    expect(screen.getByText("-$15.99")).toBeInTheDocument();
    expect(screen.getByText("3 times")).toBeInTheDocument();

    // A note-less one is named by its category, and an overdue one says so.
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("Monthly · was due Jun 5")).toBeInTheDocument();
    expect(screen.getByText("-$800.00")).toBeInTheDocument();
    expect(screen.getByText("4 times")).toBeInTheDocument();

    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("Every 2 weeks · next Jun 15")).toBeInTheDocument();
    expect(screen.getByText("+$1,500.00")).toBeInTheDocument();
    expect(screen.getByText("6 times")).toBeInTheDocument();

    expect(screen.getByText(/Found from the entries logged so far/)).toBeInTheDocument();
    // Read-only: no edit/delete affordances anywhere.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
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
    expect(screen.getAllByText("$15.99")).toHaveLength(3);

    await userEvent.click(card);
    expect(screen.queryByText("Apr 1")).not.toBeInTheDocument();
  });

  it("shows the old price instead of the count after a price change", () => {
    detectRecurring.mockReturnValue(
      summary({ payments: [payment({ amountCents: 1799, previousAmountCents: 1599 })] }),
    );
    render(<Recurring userId={USER} />);
    expect(screen.getByText("-$17.99")).toBeInTheDocument();
    expect(screen.getByText("was $15.99")).toBeInTheDocument();
    expect(screen.queryByText("3 times")).not.toBeInTheDocument();
  });

  it("says '1 time' for a series known only from its note", () => {
    detectRecurring.mockReturnValue(
      summary({ payments: [payment({ count: 1, cadence: "yearly", fromNote: true })] }),
    );
    render(<Recurring userId={USER} />);
    expect(screen.getByText("1 time")).toBeInTheDocument();
    expect(screen.getByText("Yearly · next Jul 1")).toBeInTheDocument();
  });

  it("shows only the side that has anything", () => {
    detectRecurring.mockReturnValue(
      summary({
        payments: [payment({ key: "true:salary:", category: "salary", isIncome: true, note: null })],
        monthlyInCents: 1599,
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
    expect(screen.queryByText(/Nothin' on repeat/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText(/Enter your passphrase in Settings/));
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("treats masked rows as locked (belt and braces)", () => {
    detectRecurring.mockReturnValue(summary({ anyMasked: true }));
    render(<Recurring userId={USER} />);
    expect(screen.getByText(/These entries are encrypted/)).toBeInTheDocument();
  });
});
