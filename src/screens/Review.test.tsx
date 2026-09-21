import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import type { Transaction } from "@/types/db";

// The screen under test, with real arithmetic: the digest (lib/reportDigest),
// the window maths (lib/reportPeriod) and the recurring detection
// (lib/recurring) all run for real, so every figure asserted below is one a
// user's device would actually compute. Only the store is mocked, because the
// database is the one thing a test may not reach.

const posthogMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/posthog", () => ({ default: posthogMock }));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

// Null is a real answer: the vault is still unwrapping, or a page failed.
const reviewRange =
  vi.fn<(from: Date, to: Date) => Promise<Transaction[] | null>>();

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

import { Review } from "@/screens/Review";

// Local noon, so the local-calendar bucketing the digest does lands on the same
// day wherever this runs.
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1500,
    original_currency: "USD",
    original_amount: 15,
    rate_used: 1,
    occurred_at: at(2026, 6, 8),
    note: "market",
    created_at: at(2026, 6, 8),
    ...over,
  };
}

// Two months of groceries, plus one much older entry so the two windows differ:
// "all time" reaches back to it and "recent months" does not.
const OLD = tx({
  category: "rent",
  amount_usd_cents: 120000,
  occurred_at: at(2024, 0, 9),
  note: "old rent",
});
const RECENT: Transaction[] = [
  tx({ amount_usd_cents: 4200, occurred_at: at(2026, 6, 3) }),
  tx({ amount_usd_cents: 4200, occurred_at: at(2026, 6, 17) }),
  tx({ category: "food/delivery", amount_usd_cents: 2600, occurred_at: at(2026, 7, 5) }),
  tx({ category: "work", is_income: true, amount_usd_cents: 250000, occurred_at: at(2026, 7, 28) }),
];

function setStore(overrides: Record<string, unknown> = {}) {
  storeValue = makeStoreValue({ reviewRange, ...overrides });
}

beforeEach(() => {
  vi.resetAllMocks();
  setStore();
  reviewRange.mockResolvedValue([OLD, ...RECENT]);
});

describe("Review — the two windows", () => {
  it("offers exactly the two, with the recent one selected", async () => {
    render(<Review />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Recent months", "All time"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("switches the charts to the other window without reading again", async () => {
    render(<Review />);
    await screen.findByText("Where it went");
    // One read covers both: "recent" is a slice of "all time", so slicing
    // locally is free and asking twice would decrypt most of the account twice.
    expect(reviewRange).toHaveBeenCalledTimes(1);

    // Rent is only in the old entry, which the recent window cannot reach. A
    // category can head more than one section, so this counts rather than
    // expecting one of it.
    expect(screen.queryAllByText("Rent")).toHaveLength(0);
    await userEvent.click(screen.getByRole("tab", { name: "All time" }));
    await waitFor(() =>
      expect(screen.queryAllByText("Rent").length).toBeGreaterThan(0),
    );
    expect(reviewRange).toHaveBeenCalledTimes(1);
  });

  it("reads every entry rather than the store's capped list", async () => {
    // The store only holds the newest FETCH_CAP rows; an all-time breakdown
    // totalled from those would be quietly wrong.
    setStore({ transactions: [tx({ amount_usd_cents: 999999 })] });
    render(<Review />);
    await screen.findByText("Where it went");
    const [from, to] = reviewRange.mock.calls[0];
    expect(from.getTime()).toBe(0);
    expect(to.getTime()).toBeGreaterThan(0);
  });
});

describe("Review — the charts", () => {
  it("charts this device's own totals, formatted as the app prints them", async () => {
    render(<Review />);
    await screen.findByText("Where it went");
    // 42.00 + 42.00 + 26.00 of spending in the recent window; the salary is
    // income and the old rent is outside it.
    expect(await screen.findByText("$110.00")).toBeInTheDocument();
    expect(screen.queryAllByText("Groceries").length).toBeGreaterThan(0);
  });

  it("names the recurring charges, from notes that never left the device", async () => {
    const monthly = [5, 6, 7].map((m) =>
      tx({
        category: "fees/subscriptions",
        amount_usd_cents: 1599,
        occurred_at: at(2026, m, 1),
        note: "Netflix",
      }),
    );
    reviewRange.mockResolvedValue([...RECENT, ...monthly]);
    render(<Review />);
    expect(await screen.findByText("Netflix")).toBeInTheDocument();
  });

  it("says so while it is still adding up", async () => {
    let release!: (rows: Transaction[]) => void;
    reviewRange.mockReturnValue(
      new Promise<Transaction[]>((r) => {
        release = r;
      }),
    );
    render(<Review />);
    expect(screen.getByRole("status")).toHaveTextContent("Adding up your entries…");
    release(RECENT);
    await screen.findByText("Where it went");
  });

  it("drops a read that lands after the screen has gone", async () => {
    // Leaving the room mid-read must not set state on an unmounted tree; the
    // effect's `live` flag is what stops it.
    let release!: (rows: Transaction[]) => void;
    reviewRange.mockReturnValue(
      new Promise<Transaction[]>((r) => {
        release = r;
      }),
    );
    const { unmount } = render(<Review />);
    unmount();
    release(RECENT);
    await waitFor(() => expect(reviewRange).toHaveBeenCalled());
  });

  it("says the entries could not be read rather than charting zeroes", async () => {
    // Null means the rows could not be read — the vault is still unwrapping, or
    // a page failed. An empty array would be indistinguishable from "nothing
    // logged", and a page of zeroes presented as your spending is a lie.
    reviewRange.mockResolvedValue(null);
    render(<Review />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Couldn't read your entries on this device.",
    );
  });

  it("says where every figure came from", async () => {
    render(<Review />);
    await screen.findByText(
      "Every figure here was worked out on this device, from what you logged.",
    );
  });
});

describe("Review — locked", () => {
  it("asks for the passphrase instead of charting masked rows", async () => {
    setStore({ locked: true });
    render(<Review />);
    screen.getByText("Unlock your amounts in Settings to see your review.");
    expect(reviewRange).not.toHaveBeenCalled();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("does not read while the store is still loading", () => {
    setStore({ loading: true });
    render(<Review />);
    expect(reviewRange).not.toHaveBeenCalled();
  });
});

describe("Review — the room", () => {
  it("goes back home", async () => {
    render(<Review />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("is titled, and headed with the window picker", async () => {
    render(<Review />);
    const header = screen.getByRole("banner");
    within(header).getByText("Review");
  });

  it("records which window was looked at", async () => {
    render(<Review />);
    await waitFor(() =>
      expect(posthogMock.capture).toHaveBeenCalledWith("review_viewed", {
        period: "last_3_months",
      }),
    );
    await userEvent.click(screen.getByRole("tab", { name: "All time" }));
    await waitFor(() =>
      expect(posthogMock.capture).toHaveBeenCalledWith("review_viewed", {
        period: "all_time",
      }),
    );
  });
});
