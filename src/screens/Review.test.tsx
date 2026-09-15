import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import { formatCents } from "@/lib/money";
import type { ReportFacts } from "@/lib/reportEligibility";
import type {
  SpendingReview,
  SpendingReviewRow,
  Transaction,
} from "@/types/db";

// The screen under test, with real arithmetic and a mocked back end: the digest
// (lib/reportDigest) and the period maths (lib/reportPeriod) run for real, so the
// figures asserted below are the ones a paying customer's device would compute.
// Everything that talks to the network — eligibility, checkout, generation, the
// archive vault — is mocked, since none of it may be reached from a test.

const reviewsMock = vi.hoisted(() => ({
  fetchEligibility: vi.fn(),
  listReviews: vi.fn(),
  fetchReview: vi.fn(),
  startReview: vi.fn(),
  generateReview: vi.fn(),
  storeReviewBody: vi.fn(),
  waitForPaidReview: vi.fn(),
}));
// REVIEW_BILLING is a module constant in the real lib, so the mock exposes it as
// a getter over a mutable value — that is what lets a test render the priced
// copy as well as the free copy.
const billing = vi.hoisted(() => ({ mode: "off" as "off" | "stripe" }));
vi.mock("@/lib/reviews", () => ({
  ...reviewsMock,
  get REVIEW_BILLING() {
    return billing.mode;
  },
  // The pure helpers stay honest: prices are the strings lib/money produces,
  // and a "review" is whatever survives validation.
  reviewPriceLabel: () => formatCents(500, "USD"),
  reviewPrice: (row: SpendingReviewRow) =>
    row.price_cents === 0
      ? "Free"
      : formatCents(row.price_cents, row.price_currency.toUpperCase()),
  asSpendingReview: (value: unknown) =>
    typeof (value as { title?: unknown } | null)?.title === "string"
      ? (value as SpendingReview)
      : null,
}));

const posthogMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/posthog", () => ({ default: posthogMock }));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

// Null is a real answer here: the vault is still unwrapping, or a page failed.
const reviewRange =
  vi.fn<(from: Date, to: Date) => Promise<Transaction[] | null>>();
const sealReview = vi.fn<(review: unknown) => Promise<string | null>>();
const openReview = vi.fn<(bodyEnc: string) => Promise<unknown>>();

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

import { Review } from "@/screens/Review";

const STRIPE_URL = "https://checkout.stripe.com/c/pay/cs_test_1";

// Pinned window: June–August 2026, built with the local-time constructor so the
// local-calendar bucketing in reportDigest is deterministic in any timezone.
const JUN_1 = new Date(2026, 5, 1);
const SEP_1 = new Date(2026, 8, 1);

function facts(overrides: Partial<ReportFacts> = {}): ReportFacts {
  return {
    periodFrom: JUN_1.toISOString(),
    periodTo: SEP_1.toISOString(),
    periodDays: 92,
    spendCount: 120,
    entryCount: 140,
    loggedDays: 80,
    longestGapDays: 3,
    firstEntryAt: new Date(2026, 0, 2, 12).toISOString(),
    coversPeriod: true,
    minSpendEntries: 40,
    ok: true,
    ...overrides,
  };
}

function row(overrides: Partial<SpendingReviewRow> = {}): SpendingReviewRow {
  return {
    id: "rev-1",
    status: "paid",
    period_id: "last_3_months",
    period_from: JUN_1.toISOString(),
    period_to: SEP_1.toISOString(),
    home_currency: "USD",
    price_cents: 500,
    price_currency: "usd",
    paid_at: new Date(2026, 8, 1, 12).toISOString(),
    refunded_at: null,
    body_enc: null,
    attempts: 1,
    error: null,
    created_at: new Date(2026, 8, 1, 12).toISOString(),
    ...overrides,
  };
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1500,
    original_currency: "USD",
    original_amount: 15,
    rate_used: 1,
    occurred_at: new Date(2026, 6, 8, 12).toISOString(),
    note: "market",
    created_at: new Date(2026, 6, 8, 12).toISOString(),
    ...overrides,
  };
}

function review(overrides: Partial<SpendingReview> = {}): SpendingReview {
  return {
    title: "Three quiet months",
    summary: "Groceries did most of the damage.",
    sections: [
      {
        heading: "Where it went",
        body: "Two trips to the market.",
        figures: [{ label: "Spent", value: "$30.00" }],
      },
    ],
    notables: ["Nothing logged on weekends."],
    caveats: ["Cash you never logged isn't here."],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** jsdom refuses an assignment to location.href, so the whole global is stubbed. */
function stubUrl(search: string) {
  vi.stubGlobal("location", {
    href: "http://localhost:3000/",
    pathname: "/",
    search,
    hash: "#/review",
  });
}

function setStore(overrides: Record<string, unknown> = {}) {
  storeValue = makeStoreValue({
    reviewRange,
    sealReview,
    openReview,
    ...overrides,
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let replaceState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  setStore();
  // One real entry inside the June–August window by default. An empty array is
  // not a neutral default any more — it means "the rows could not be read", and
  // the screen refuses to spend a paid generation on it.
  reviewRange.mockResolvedValue([tx()]);
  sealReview.mockResolvedValue("sealed-body");
  openReview.mockResolvedValue(null);
  reviewsMock.listReviews.mockResolvedValue({ reviews: [], error: null });
  reviewsMock.fetchReview.mockResolvedValue(null);
  // Both reviews ask, so both have to answer.
  reviewsMock.fetchEligibility.mockResolvedValue({ facts: facts(), error: null });
  billing.mode = "off";
  reviewsMock.startReview.mockResolvedValue({
    reviewId: "rev-1",
    url: null,
    free: true,
    error: null,
  });
  reviewsMock.generateReview.mockResolvedValue({ review: review(), error: null });
  reviewsMock.storeReviewBody.mockResolvedValue({ error: null });
  reviewsMock.waitForPaidReview.mockResolvedValue(null);
  replaceState = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation(() => {});
  stubUrl("");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Each review has its own card and its own button, so a test has to say which.
// The label changes with what is known: the price when the sale is on, why not
// when it isn't, and "can't check" when eligibility is unreadable.
const ACTION = /Write it|Unlock it|Not enough logged yet|Can't check your history/;

/** The card for one review, found by its heading. */
function card(name: RegExp | string) {
  return screen.getByRole("heading", { name }).closest("div")!.parentElement!;
}

/** The button inside one review's card. Defaults to the recent review. */
function buyButton(name: RegExp | string = "Recent months") {
  return within(card(name)).getByRole("button", { name: ACTION });
}

/**
 * Put the account on the end-to-end tier, where the archive asks for the
 * encryption passphrase it is already unlocked with. The default tier has no
 * passphrase but the public constant, so it asks for nothing.
 */
function withPassphrase(pass = "vault-pass") {
  setStore({ e2eMode: "passphrase", passphrase: pass });
}

/** Put the screen in the paying configuration: priced copy, Stripe redirect. */
function sellForMoney() {
  billing.mode = "stripe";
  reviewsMock.startReview.mockResolvedValue({
    reviewId: "rev-1",
    url: STRIPE_URL,
    free: false,
    error: null,
  });
}

describe("Review — the offer", () => {
  it("shows only the unlock notice while the device is locked", async () => {
    setStore({ locked: true });
    render(<Review />);
    expect(
      screen.getByText(/Unlock your amounts in Settings/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A review of your spending"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    await flush();
  });

  it("navigates home from the back chevron", async () => {
    render(<Review />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("offers two reviews, each with its own standing", async () => {
    render(<Review />);
    // Before the counts arrive there is nothing to judge, so both buttons are
    // out, and there is no window to choose: the offer is two products.
    expect(buyButton("Recent months")).toBeDisabled();
    expect(buyButton("All time")).toBeDisabled();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    expect(await screen.findAllByText("120 / 40")).toHaveLength(2);
    // Each card asked about its own window, and each shows what came back.
    expect(reviewsMock.fetchEligibility).toHaveBeenCalledWith("last_3_months");
    expect(reviewsMock.fetchEligibility).toHaveBeenCalledWith("all_time");
    expect(screen.getAllByText("80 / 92")).toHaveLength(2);
    // 80 logged days of 92 — the bar reads the same number the copy does.
    expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute(
      "aria-valuenow",
      "87",
    );
    for (const name of ["Recent months", "All time"]) {
      expect(buyButton(name)).toBeEnabled();
      // Billing is off in this build, so no button advertises a price.
      expect(buyButton(name)).toHaveTextContent("Write it");
    }
    expect(
      screen.getByText(/One review a month/),
    ).toBeInTheDocument();
  });

  it("advertises the price once billing is on", async () => {
    sellForMoney();
    render(<Review />);
    await screen.findAllByText("120 / 40");
    expect(buyButton()).toHaveTextContent("Unlock it · $5.00");
    expect(
      screen.queryByText(/Free while it's being tried out/),
    ).not.toBeInTheDocument();
  });

  it("renders the blockers and warnings and refuses the sale", async () => {
    reviewsMock.fetchEligibility.mockResolvedValue({
      facts: facts({
        ok: false,
        spendCount: 12,
        coversPeriod: false,
        loggedDays: 4,
        longestGapDays: 9,
      }),
      error: null,
    });
    render(<Review />);
    const recent = within(card("Recent months"));
    expect(await recent.findByText("28 more expenses to go.")).toBeInTheDocument();
    // No second blocker: both windows start at or after the first entry, so the
    // "history doesn't reach back" refusal cannot happen any more.
    // The coverage warning counts from the unlogged side: 92 − 4 = 88. It is on
    // the recent review only — all time is exempt, because its denominator is
    // the account's whole life.
    expect(
      recent.getByText("88 of 92 days have nothing logged."),
    ).toBeInTheDocument();
    expect(
      within(card("All time")).queryByText("88 of 92 days have nothing logged."),
    ).not.toBeInTheDocument();
    expect(recent.getByText("9 days in a row are empty.")).toBeInTheDocument();
    expect(buyButton("Recent months")).toBeDisabled();
    expect(buyButton("All time")).toBeDisabled();
  });

  it("surfaces an eligibility error and keeps the button out of reach", async () => {
    reviewsMock.fetchEligibility.mockResolvedValue({
      facts: null,
      error: 'function "report_eligibility" does not exist',
    });
    render(<Review />);
    expect(
      await screen.findByText(/function "report_eligibility" does not exist/),
    ).toBeInTheDocument();
    // …and it says what that means, rather than handing over a raw error.
    expect(screen.getByText(/Reviews aren't set up yet/)).toBeInTheDocument();
    // The button must not advertise a purchase it cannot make.
    expect(buyButton()).toHaveTextContent("Can't check your history");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(buyButton()).toBeDisabled();
  });

  it("names each review's own window under its name", async () => {
    render(<Review />);
    await screen.findAllByText("120 / 40");
    // The recent review reaches three months back; all time names where the
    // logging started, which only the eligibility answer knows.
    expect(
      within(card("Recent months")).getByText(/2026/),
    ).toBeInTheDocument();
    expect(
      within(card("All time")).getByText(/January 2026/),
    ).toBeInTheDocument();
  });

  it("drops an eligibility answer that arrives after the screen closes", async () => {
    const rows = deferred<{ reviews: SpendingReviewRow[]; error: null }>();
    const counts = deferred<{ facts: ReportFacts; error: null }>();
    reviewsMock.listReviews.mockReturnValue(rows.promise);
    reviewsMock.fetchEligibility.mockReturnValue(counts.promise);
    const { unmount } = render(<Review />);
    unmount();
    await act(async () => {
      rows.resolve({ reviews: [row()], error: null });
      counts.resolve({ facts: facts(), error: null });
      await flush();
    });
    // Nothing to assert in the DOM — the point is that neither late answer tries
    // to render into an unmounted screen.
    expect(reviewsMock.fetchEligibility).toHaveBeenCalledTimes(2);
  });
});

describe("Review — buying", () => {
  it("writes the review on the first tap, asking for no new passphrase", async () => {
    reviewsMock.fetchReview.mockResolvedValue(row());
    render(<Review />);
    await screen.findAllByText("120 / 40");
    await userEvent.click(buyButton());

    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    // Nothing is set up first: the account's own encryption passphrase already
    // gates this screen, and there is no second one to invent.
    expect(
      screen.queryByLabelText(/passphrase/i),
    ).not.toBeInTheDocument();
    expect(reviewsMock.startReview).toHaveBeenCalledWith(
      "last_3_months",
      "USD",
      facts().firstEntryAt,
    );
    expect(reviewsMock.fetchReview).toHaveBeenCalledWith("rev-1");
    expect(posthogMock.capture).toHaveBeenCalledWith("review_started", {
      period: "last_3_months",
      free: true,
    });
    // A free grant is written where the customer is standing: no redirect.
    expect(window.location.href).toBe("http://localhost:3000/");
  });

  it("says so when a free review can't be read back", async () => {
    reviewsMock.fetchReview.mockResolvedValue(null);
    render(<Review />);
    await screen.findAllByText("120 / 40");
    await userEvent.click(buyButton());

    expect(
      await screen.findByText("Couldn't find the review that was just started."),
    ).toBeInTheDocument();
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });

  it("says so when a free grant comes back without an id", async () => {
    reviewsMock.startReview.mockResolvedValue({
      reviewId: null,
      url: null,
      free: true,
      error: null,
    });
    render(<Review />);
    await screen.findAllByText("120 / 40");
    await userEvent.click(buyButton());

    expect(
      await screen.findByText("Couldn't find the review that was just started."),
    ).toBeInTheDocument();
    expect(reviewsMock.fetchReview).not.toHaveBeenCalled();
  });

  it("goes straight to checkout when the review is sold", async () => {
    sellForMoney();
    render(<Review />);
    await screen.findAllByText("120 / 40");
    await userEvent.click(buyButton());

    await waitFor(() => expect(window.location.href).toBe(STRIPE_URL));
    expect(reviewsMock.startReview).toHaveBeenCalledWith(
      "last_3_months",
      "USD",
      facts().firstEntryAt,
    );
    expect(posthogMock.capture).toHaveBeenCalledWith("review_started", {
      period: "last_3_months",
      free: false,
    });
    // Nothing is generated on this device before the money lands.
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });

  it("surfaces the server's refusal", async () => {
    reviewsMock.startReview.mockResolvedValue({
      reviewId: null,
      url: null,
      free: false,
      error: "Spending reviews aren't open yet — this one is still being tried out.",
    });
    render(<Review />);
    await screen.findAllByText("120 / 40");
    await userEvent.click(buyButton());

    expect(
      await screen.findByText(
        "Spending reviews aren't open yet — this one is still being tried out.",
      ),
    ).toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost:3000/");
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });

  it("falls back to its own wording when checkout fails silently", async () => {
    reviewsMock.startReview.mockResolvedValue({
      reviewId: "rev-1",
      url: null,
      free: false,
      error: null,
    });
    render(<Review />);
    await screen.findAllByText("120 / 40");
    await userEvent.click(buyButton());

    expect(
      await screen.findByText("Couldn't open checkout."),
    ).toBeInTheDocument();
  });
});

describe("Review — back from Stripe", () => {
  it("scrubs the id, waits for the payment, then writes the review", async () => {
    stubUrl("?review=rev-1&utm=mail");
    const pending = row({ status: "pending" });
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [pending],
      error: null,
    });
    reviewsMock.waitForPaidReview.mockResolvedValue(row({ status: "paid" }));
    reviewRange.mockResolvedValue([tx(), tx({ id: "t2" })]);

    render(<Review />);

    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    // The callback id is gone from the URL; the hash route and other params stay.
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?utm=mail#/review");
    expect(reviewsMock.waitForPaidReview).toHaveBeenCalledWith("rev-1");

    // The digest is built from the row's own stored window, not from today.
    const [from, to] = reviewRange.mock.calls[0];
    expect(from.getTime()).toBe(JUN_1.getTime());
    expect(to.getTime()).toBe(SEP_1.getTime());
    const [id, digest] = reviewsMock.generateReview.mock.calls[0];
    expect(id).toBe("rev-1");
    expect(digest.period).toMatchObject({
      id: "last_3_months",
      label: "Recent months · June 2026 – August 2026",
      from: "2026-06-01",
      to: "2026-08-31",
      days: 92,
      months: 3,
    });
    // Real arithmetic: two $15 expenses in the window.
    expect(digest.totals.spent).toEqual({ cents: 3000, display: "$30.00" });
    expect(digest.totals.spendCount).toBe(2);

    expect(sealReview).toHaveBeenCalledWith(review());
    expect(reviewsMock.storeReviewBody).toHaveBeenCalledWith(
      "rev-1",
      "sealed-body",
    );
    expect(posthogMock.capture).toHaveBeenCalledWith("review_generated", {
      period: "last_3_months",
    });
    // The subtitle names the window that was bought.
    expect(
      within(screen.getByRole("article")).getByText("Recent months · June 2026 – August 2026"),
    ).toBeInTheDocument();
  });

  it("says so when the payment still hasn't confirmed", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "pending" })],
      error: null,
    });
    reviewsMock.waitForPaidReview.mockResolvedValue(row({ status: "pending" }));

    render(<Review />);
    expect(
      await screen.findByText(/The payment hasn't confirmed yet/),
    ).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/#/review");
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });

  it("says nothing when the row can't be read back at all", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "pending" })],
      error: null,
    });
    reviewsMock.waitForPaidReview.mockResolvedValue(null);

    render(<Review />);
    await waitFor(() =>
      expect(reviewsMock.waitForPaidReview).toHaveBeenCalledTimes(1),
    );
    await flush();
    expect(screen.queryByText(/hasn't confirmed yet/)).not.toBeInTheDocument();
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });

  it("ignores a callback for a review this account doesn't have", async () => {
    stubUrl("?review=ghost");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "rev-1", status: "paid", body_enc: "cipher" })],
      error: null,
    });

    render(<Review />);
    await screen.findAllByText("120 / 40");
    // The list didn't have it, so the row was asked for directly — and there is
    // no such row, so nothing else happens.
    expect(reviewsMock.fetchReview).toHaveBeenCalledWith("ghost");
    expect(reviewsMock.waitForPaidReview).not.toHaveBeenCalled();
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });

  it("fetches the returned row directly when the list doesn't have it yet", async () => {
    stubUrl("?review=rev-9");
    // The archive read raced the webhook: the paid row isn't in the list. The
    // callback id has already been scrubbed from the URL, so a direct read is
    // the only way back to it.
    reviewsMock.listReviews.mockResolvedValue({ reviews: [], error: null });
    reviewsMock.fetchReview.mockResolvedValue(
      row({ id: "rev-9", status: "paid" }),
    );

    render(<Review />);
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    expect(reviewsMock.fetchReview).toHaveBeenCalledWith("rev-9");
    // It was already paid, so no poll — it went straight to being written.
    expect(reviewsMock.waitForPaidReview).not.toHaveBeenCalled();
    expect(reviewsMock.generateReview).toHaveBeenCalledTimes(1);
    expect(reviewsMock.generateReview.mock.calls[0][0]).toBe("rev-9");
    expect(reviewsMock.storeReviewBody).toHaveBeenCalledWith(
      "rev-9",
      "sealed-body",
    );
  });

  it("picks up a review that was written but never reached this device", async () => {
    stubUrl("?review=rev-1");
    // `ready` means the generating function finished and marked it — but the
    // reply never arrived, so nothing was ever sealed. That is retryable, and the
    // return path has to take it rather than leaving a paid review stranded.
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "ready", body_enc: null })],
      error: null,
    });

    render(<Review />);
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    expect(reviewsMock.waitForPaidReview).not.toHaveBeenCalled();
    expect(reviewsMock.generateReview).toHaveBeenCalledTimes(1);
  });

  it("leaves a review that already has its body alone", async () => {
    stubUrl("?review=rev-1");
    // Returning to a callback for a review that is already complete — a reload,
    // or a second visit to the same URL — must not regenerate anything.
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "ready", body_enc: "cipher" })],
      error: null,
    });

    render(<Review />);
    await screen.findAllByText("120 / 40");
    await flush();
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
    expect(reviewsMock.waitForPaidReview).not.toHaveBeenCalled();
  });

  it("charges nothing and polls for nothing on the cancel link", async () => {
    stubUrl("?review=rev-1&cancelled=1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "pending" })],
      error: null,
    });

    render(<Review />);
    expect(
      await screen.findByText("Checkout cancelled — nothing was charged."),
    ).toBeInTheDocument();
    expect(reviewsMock.waitForPaidReview).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/#/review");
  });

  it("abandons the payment wait when the screen closes", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "pending" })],
      error: null,
    });
    const wait = deferred<SpendingReviewRow>();
    reviewsMock.waitForPaidReview.mockReturnValue(wait.promise);

    const { unmount } = render(<Review />);
    expect(
      await screen.findByText("Waiting for the payment to confirm…"),
    ).toBeInTheDocument();
    unmount();
    await act(async () => {
      wait.resolve(row({ status: "paid" }));
      await flush();
    });
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });

  it("refuses a review whose period this app version doesn't know", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "paid", period_id: "past_12_months" })],
      error: null,
    });

    render(<Review />);
    expect(
      await screen.findByText(
        "That review is from a newer version of the app.",
      ),
    ).toBeInTheDocument();
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });

  it("writes a paid review that has no body yet", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "paid" })],
      error: null,
    });
    reviewRange.mockResolvedValue([tx()]);

    render(<Review />);
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    expect(reviewsMock.waitForPaidReview).not.toHaveBeenCalled();
    expect(reviewsMock.generateReview).toHaveBeenCalledTimes(1);
  });

  it("spends no generation when the entries can't be read at all", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "paid" })],
      error: null,
    });
    // Null, not []: the encryption vault is still unwrapping in the provider's
    // own effect, which runs after this screen's.
    reviewRange.mockResolvedValue(null);

    render(<Review />);
    expect(
      await screen.findByText(
        "Couldn't read your entries. Nothing used up — tap to retry.",
      ),
    ).toBeInTheDocument();
    // The whole point: the paid attempt was not spent on rows we couldn't read.
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
    expect(sealReview).not.toHaveBeenCalled();
    expect(reviewsMock.storeReviewBody).not.toHaveBeenCalled();
    expect(screen.queryByText("Three quiet months")).not.toBeInTheDocument();
    // And the offer to try again is real: the row is tappable, not stuck busy.
    expect(
      screen.getByRole("button", { name: /tap to write it/ }),
    ).toBeEnabled();
  });

  it("surfaces a generation failure and re-reads the archive", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "paid" })],
      error: null,
    });
    reviewsMock.generateReview.mockResolvedValue({
      review: null,
      error: "That review came back unreadable.",
    });

    render(<Review />);
    expect(
      await screen.findByText("That review came back unreadable."),
    ).toBeInTheDocument();
    expect(sealReview).not.toHaveBeenCalled();
    expect(reviewsMock.listReviews).toHaveBeenCalledTimes(2);
  });

  it("shows the review even when storing the sealed copy fails", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "paid" })],
      error: null,
    });
    reviewsMock.storeReviewBody.mockResolvedValue({ error: "row is locked" });

    render(<Review />);
    expect(await screen.findByText("row is locked")).toBeInTheDocument();
    expect(screen.getByText("Three quiet months")).toBeInTheDocument();
  });

  it("still shows the review when the device can't seal it", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ status: "paid" })],
      error: null,
    });
    sealReview.mockResolvedValue(null);

    render(<Review />);
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    expect(reviewsMock.storeReviewBody).not.toHaveBeenCalled();
  });
});

describe("Review — the archive", () => {
  it("stays hidden while there is nothing in it", async () => {
    render(<Review />);
    await screen.findAllByText("120 / 40");
    expect(screen.queryByText("Your reviews")).not.toBeInTheDocument();
  });

  it("lists every state a stored review can be in", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [
        row({ id: "a", status: "refunded" }),
        row({ id: "b", status: "failed", error: "The model gave up." }),
        row({ id: "c", status: "failed", error: null }),
        row({ id: "d", status: "pending" }),
        row({ id: "e", status: "paid" }),
        row({ id: "f", status: "ready", body_enc: "cipher" }),
        row({ id: "g", status: "paid", price_cents: 0 }),
      ],
      error: null,
    });
    render(<Review />);
    expect(await screen.findByText("Refunded · $5.00")).toBeInTheDocument();
    expect(screen.getByText("The model gave up.")).toBeInTheDocument();
    expect(screen.getByText("Didn't complete")).toBeInTheDocument();
    expect(
      screen.getByText("Not paid — nothing was charged"),
    ).toBeInTheDocument();
    expect(screen.getByText("Paid $5.00 · tap to write it")).toBeInTheDocument();
    expect(screen.getByText("$5.00 · tap to read")).toBeInTheDocument();
    // A free grant was never paid for, so it isn't told that it was.
    expect(screen.getByText("Free · tap to write it")).toBeInTheDocument();
    // Seven rows, all readable without a passphrase on the list itself.
    expect(
      screen.getAllByText("Recent months · June 2026 – August 2026").length,
    ).toBe(7);
  });

  it("opens a stored review through the account's own key", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [
        row({ id: "f", status: "ready", body_enc: "cipher" }),
        row({ id: "a", status: "refunded" }),
      ],
      error: null,
    });
    openReview.mockResolvedValue(review({ title: "August, read back" }));
    render(<Review />);
    await userEvent.click(
      await screen.findByRole("button", { name: /tap to read/ }),
    );
    expect(
      await screen.findByText("August, read back"),
    ).toBeInTheDocument();
    expect(openReview).toHaveBeenCalledWith("cipher");
  });

  it("says so when a stored review can't be opened here", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "f", status: "ready", body_enc: "cipher" })],
      error: null,
    });
    openReview.mockResolvedValue({ nonsense: true });
    render(<Review />);
    await userEvent.click(
      await screen.findByRole("button", { name: /tap to read/ }),
    );
    expect(
      await screen.findByText(/couldn't be opened on this device/),
    ).toBeInTheDocument();
  });

  it("writes a paid review that was never written, on a tap", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "e", status: "paid" })],
      error: null,
    });
    render(<Review />);
    await userEvent.click(
      await screen.findByRole("button", { name: /tap to write it/ }),
    );
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    expect(reviewsMock.generateReview).toHaveBeenCalledWith(
      "e",
      expect.objectContaining({ version: 1 }),
    );
  });

  it("retries a review that was written but never arrived", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "g", status: "ready", body_enc: null })],
      error: null,
    });
    render(<Review />);
    await userEvent.click(
      await screen.findByRole("button", { name: /tap to write it/ }),
    );
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
  });

  it("refuses an empty window on a tap, and writes it once the rows arrive", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "e", status: "paid" })],
      error: null,
    });
    // No rows came back. That is indistinguishable from a window we failed to
    // read, so it is refused rather than totalled as zeroes.
    reviewRange.mockResolvedValue([]);
    render(<Review />);
    const rowButton = await screen.findByRole("button", {
      name: /tap to write it/,
    });
    await userEvent.click(rowButton);
    expect(
      await screen.findByText(
        "Couldn't read your entries. Nothing used up — tap to retry.",
      ),
    ).toBeInTheDocument();
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();

    // "tap the review below to try again" is literal: the second tap, once the
    // vault is open, writes the review it refused to write from nothing.
    reviewRange.mockResolvedValue([tx()]);
    await userEvent.click(rowButton);
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    expect(reviewsMock.generateReview).toHaveBeenCalledTimes(1);
  });

  it("refuses a refunded review without trying to open it", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      // A body left over from a refund the webhook didn't clear: the refund is
      // checked first, so it is never decrypted.
      reviews: [row({ id: "a", status: "refunded", body_enc: "cipher" })],
      error: null,
    });
    render(<Review />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Refunded/ }),
    );
    expect(
      await screen.findByText("That review was refunded."),
    ).toBeInTheDocument();
    expect(openReview).not.toHaveBeenCalled();
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("surfaces a failed archive read instead of an empty archive", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [],
      error: "Could not read your reviews.",
    });
    render(<Review />);
    expect(
      await screen.findByText("Could not read your reviews."),
    ).toBeInTheDocument();
    // Nothing is claimed about the archive's contents — it simply isn't drawn.
    expect(screen.queryByText("Your reviews")).not.toBeInTheDocument();
  });

  it("holds the rows shut while a review is being written", async () => {
    stubUrl("?review=rev-1");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "rev-1", status: "pending" })],
      error: null,
    });
    const wait = deferred<SpendingReviewRow>();
    reviewsMock.waitForPaidReview.mockReturnValue(wait.promise);

    render(<Review />);
    expect(
      await screen.findByText("Waiting for the payment to confirm…"),
    ).toBeInTheDocument();
    // The archive still lists the row, but it can't be tapped mid-flight.
    expect(
      screen.getByRole("button", { name: /Not paid — nothing was charged/ }),
    ).toBeDisabled();

    await act(async () => {
      wait.resolve(row({ id: "rev-1", status: "paid" }));
      await flush();
    });
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /June 2026 – August 2026/ }),
    ).toBeEnabled();
  });

  it("refuses to write one that was never paid for", async () => {
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "c", status: "failed", error: null })],
      error: null,
    });
    render(<Review />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Didn't complete/ }),
    );
    expect(
      await screen.findByText(/That review was never written/),
    ).toBeInTheDocument();
    expect(reviewsMock.generateReview).not.toHaveBeenCalled();
  });
});

describe("Review — the archive lock", () => {
  it("leaves the archive open on the default tier", async () => {
    // The only passphrase a default-tier account has is the constant compiled
    // into the bundle, so there is nothing to ask for and nothing to protect the
    // review more strongly than the amounts it was written from.
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "f", status: "ready", body_enc: "cipher" })],
      error: null,
    });
    openReview.mockResolvedValue(review());
    render(<Review />);

    expect(
      await screen.findByRole("button", { name: /tap to read/ }),
    ).toBeEnabled();
    expect(screen.queryByLabelText(/passphrase/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /tap to read/ }));
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
  });

  it("holds the rows shut until the encryption passphrase arrives", async () => {
    withPassphrase("hunter2");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "f", status: "ready", body_enc: "cipher" })],
      error: null,
    });
    openReview.mockResolvedValue(review());
    render(<Review />);

    const rowButton = await screen.findByRole("button", {
      name: /tap to read/,
    });
    expect(rowButton).toBeDisabled();

    const field = screen.getByLabelText("Enter your encryption passphrase");
    await userEvent.type(field, "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("That didn't match.")).toBeInTheDocument();
    expect(rowButton).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, "hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Enter your encryption passphrase"),
      ).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /tap to read/ }));
    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
  });

  it("does not stand between the account and a new review", async () => {
    // The gate is on reading the archive, not on writing one: a review is
    // rendered by the screen that just wrote it, having been sealed with the
    // same key, so asking again there would protect nothing.
    withPassphrase("hunter2");
    reviewsMock.fetchReview.mockResolvedValue(row());
    render(<Review />);
    await screen.findAllByText("120 / 40");
    await userEvent.click(buyButton());

    expect(await screen.findByText("Three quiet months")).toBeInTheDocument();
    expect(reviewsMock.generateReview).toHaveBeenCalledTimes(1);
  });

  it("ignores an empty submit", async () => {
    withPassphrase("hunter2");
    reviewsMock.listReviews.mockResolvedValue({
      reviews: [row({ id: "a", status: "refunded" })],
      error: null,
    });
    render(<Review />);

    const field = await screen.findByLabelText("Enter your encryption passphrase");
    const form = field.closest("form")!;
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
    await act(async () => {
      fireEvent.submit(form);
    });
    // Neither unlocked nor told it did not match: nothing was submitted.
    expect(screen.queryByText("That didn't match.")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Enter your encryption passphrase"),
    ).toBeInTheDocument();
  });
});
