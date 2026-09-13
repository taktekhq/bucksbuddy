import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSupabaseMock,
  type Handler,
  type QueryResult,
} from "@/test/supabaseMock";

// Real money formatting, mocked database: every figure asserted below is the
// string a user would actually read.
let mock = makeSupabaseMock();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => mock.supabase.from(table),
    rpc: (name: string, args?: Record<string, unknown>) =>
      mock.supabase.rpc(name, args),
    functions: {
      invoke: (name: string, options?: { body?: Record<string, unknown> }) =>
        mock.supabase.functions.invoke(name, options),
    },
  },
}));

import {
  REVIEW_PRICE_CENTS,
  reviewPriceLabel,
  fetchEligibility,
  listReviews,
  fetchReview,
  startCheckout,
  generateReview,
  storeReviewBody,
  asSpendingReview,
  reviewPrice,
  waitForPaidReview,
} from "@/lib/reviews";
import { buildDigest } from "@/lib/reportDigest";
import { MIN_SPEND_ENTRIES, type ReportFacts } from "@/lib/reportEligibility";
import type { SpendingReview, SpendingReviewRow } from "@/types/db";

function set(handlers: Record<string, Handler> = {}) {
  mock = makeSupabaseMock(handlers);
}

// Pinned "today": 2026-09-13. Bounds are built with the local-time Date
// constructor so the expectations hold in any timezone, like the app's own
// local-calendar bucketing.
const NOW = new Date(2026, 8, 13, 12, 0, 0);
const AUG_1 = new Date(2026, 7, 1).toISOString();
const JUN_1 = new Date(2026, 5, 1).toISOString();
const SEP_1 = new Date(2026, 8, 1).toISOString();

function row(overrides: Partial<SpendingReviewRow> = {}): SpendingReviewRow {
  return {
    id: "rev-1",
    status: "paid",
    period_id: "past_3_months",
    period_from: JUN_1,
    period_to: SEP_1,
    home_currency: "USD",
    price_cents: 500,
    price_currency: "usd",
    paid_at: new Date(2026, 8, 13, 10).toISOString(),
    refunded_at: null,
    body_enc: null,
    attempts: 0,
    error: null,
    created_at: new Date(2026, 8, 13, 9).toISOString(),
    ...overrides,
  };
}

function facts(overrides: Partial<ReportFacts> = {}): ReportFacts {
  return {
    periodFrom: JUN_1,
    periodTo: SEP_1,
    periodDays: 92,
    spendCount: 120,
    entryCount: 140,
    loggedDays: 80,
    longestGapDays: 2,
    firstEntryAt: new Date(2026, 0, 4, 12).toISOString(),
    coversPeriod: true,
    minSpendEntries: 40,
    ok: true,
    ...overrides,
  };
}

function review(overrides: Partial<SpendingReview> = {}): SpendingReview {
  return {
    title: "Three months of takeaway",
    summary: "Spending held steady; food is the story.",
    sections: [
      {
        heading: "Where it went",
        body: "Food led every month.",
        figures: [{ label: "Food", value: "$412.00" }],
      },
    ],
    notables: ["Coffee twice a day in July"],
    caveats: ["August has 6 unlogged days"],
    ...overrides,
  };
}

// A digest built by the real builder, so the payload posted to the edge
// function has the shape the function is written against.
const digest = buildDigest(
  [],
  { id: "past_3_months", from: new Date(2026, 5, 1), to: new Date(2026, 8, 1) },
  "USD",
);

// The shape supabase-js hands back for a non-2xx edge-function reply: an error
// whose `context` is the raw Response.
type FnError = { message: string; context?: { json?: () => Promise<unknown> } };
const SDK_MESSAGE = "Edge Function returned a non-2xx status code";

function fnFails(error: FnError): QueryResult {
  return { data: null, error };
}

function withJson(json: () => Promise<unknown>): FnError {
  return { message: SDK_MESSAGE, context: { json } };
}

beforeEach(() => {
  vi.clearAllMocks();
  set();
});

describe("the advertised price", () => {
  it("is $5, as cents and as the label on the offer", () => {
    expect(REVIEW_PRICE_CENTS).toBe(500);
    expect(reviewPriceLabel()).toBe("$5.00");
  });
});

describe("invoke() error surfacing", () => {
  it("surfaces the function's own message over the SDK's generic one", async () => {
    set({
      "fn:review-checkout": () =>
        fnFails(
          withJson(async () => ({
            error: "You need 40 expenses in the period to buy a review.",
          })),
        ),
    });
    const { url, error } = await startCheckout("last_month", "USD", NOW);
    expect(url).toBeNull();
    expect(error).toBe(
      "You need 40 expenses in the period to buy a review.",
    );
  });

  it("falls back to the SDK message when the body is not JSON", async () => {
    set({
      "fn:review-checkout": () =>
        fnFails(
          withJson(async () => {
            throw new Error("Unexpected token < in JSON");
          }),
        ),
    });
    const { error } = await startCheckout("last_month", "USD", NOW);
    expect(error).toBe(SDK_MESSAGE);
  });

  it("falls back when the JSON body has no string error", async () => {
    set({
      "fn:review-checkout": () => fnFails(withJson(async () => ({ error: 42 }))),
    });
    expect((await startCheckout("last_month", "USD", NOW)).error).toBe(
      SDK_MESSAGE,
    );
  });

  it("falls back when the JSON body is null", async () => {
    set({
      "fn:review-checkout": () => fnFails(withJson(async () => null)),
    });
    expect((await startCheckout("last_month", "USD", NOW)).error).toBe(
      SDK_MESSAGE,
    );
  });

  it("falls back when the error's context cannot be read", async () => {
    set({
      "fn:review-checkout": () => fnFails({ message: SDK_MESSAGE, context: {} }),
    });
    expect((await startCheckout("last_month", "USD", NOW)).error).toBe(
      SDK_MESSAGE,
    );
  });

  it("falls back when the error carries no context at all", async () => {
    set({
      "fn:review-checkout": () => fnFails({ message: "Failed to send a request" }),
    });
    expect((await startCheckout("last_month", "USD", NOW)).error).toBe(
      "Failed to send a request",
    );
  });
});

describe("fetchEligibility", () => {
  it("asks the database about the period's own bounds and returns its counts", async () => {
    set({ "rpc:report_eligibility": () => ({ data: facts(), error: null }) });
    const { facts: got, error } = await fetchEligibility("last_month", NOW);
    expect(error).toBeNull();
    expect(got?.spendCount).toBe(120);
    expect(got?.ok).toBe(true);
    expect(mock.supabase.rpc).toHaveBeenCalledWith("report_eligibility", {
      p_from: AUG_1,
      p_to: SEP_1,
    });
  });

  it("spans three whole months for past_3_months", async () => {
    set({ "rpc:report_eligibility": () => ({ data: facts(), error: null }) });
    await fetchEligibility("past_3_months", NOW);
    expect(mock.supabase.rpc).toHaveBeenCalledWith("report_eligibility", {
      p_from: JUN_1,
      p_to: SEP_1,
    });
  });

  it("passes the database's message through when the migration is missing", async () => {
    set({
      "rpc:report_eligibility": () => ({
        data: null,
        error: { message: 'function public.report_eligibility does not exist' },
      }),
    });
    const { facts: got, error } = await fetchEligibility("last_month", NOW);
    expect(got).toBeNull();
    expect(error).toBe("function public.report_eligibility does not exist");
  });

  it("reads no facts as null rather than as a failure", async () => {
    set({ "rpc:report_eligibility": () => ({ data: null, error: null }) });
    expect(await fetchEligibility("last_month", NOW)).toEqual({
      facts: null,
      error: null,
    });
  });

  it("fills in the built-in threshold when an older function omits it", async () => {
    // A deployment still running the pre-threshold function sends no
    // minSpendEntries, and every comparison against undefined is false — so the
    // shortfall blocker would vanish and the copy would read "12 / undefined".
    const partial: Partial<ReportFacts> = facts({ spendCount: 12, ok: false });
    delete partial.minSpendEntries;
    set({ "rpc:report_eligibility": () => ({ data: partial, error: null }) });
    const { facts: got, error } = await fetchEligibility("last_month", NOW);
    expect(error).toBeNull();
    expect(got?.minSpendEntries).toBe(MIN_SPEND_ENTRIES);
    expect(got?.minSpendEntries).toBe(40);
    // …and nothing else is touched on the way through.
    expect(got).toEqual({ ...partial, minSpendEntries: MIN_SPEND_ENTRIES });
  });

  it("keeps the server's threshold when it is not the built-in one", async () => {
    // The database is the authority on the bar it applied; the constant is only
    // ever a fallback.
    expect(MIN_SPEND_ENTRIES).not.toBe(60);
    set({
      "rpc:report_eligibility": () => ({
        data: facts({ minSpendEntries: 60, spendCount: 50, ok: false }),
        error: null,
      }),
    });
    const { facts: got, error } = await fetchEligibility("last_month", NOW);
    expect(error).toBeNull();
    expect(got?.minSpendEntries).toBe(60);
    expect(got?.spendCount).toBe(50);
    expect(got?.ok).toBe(false);
  });
});

describe("listReviews", () => {
  it("returns the account's reviews", async () => {
    const rows = [row({ id: "rev-2" }), row({ id: "rev-1" })];
    set({ "spending_reviews:select": () => ({ data: rows, error: null }) });
    const { reviews, error } = await listReviews();
    expect(error).toBeNull();
    expect(reviews.map((r) => r.id)).toEqual(["rev-2", "rev-1"]);
  });

  it("returns an empty list and the message on an error", async () => {
    set({
      "spending_reviews:select": () => ({
        data: null,
        error: { message: "permission denied for table spending_reviews" },
      }),
    });
    expect(await listReviews()).toEqual({
      reviews: [],
      error: "permission denied for table spending_reviews",
    });
  });

  it("reads a null payload as no reviews", async () => {
    set({ "spending_reviews:select": () => ({ data: null, error: null }) });
    expect(await listReviews()).toEqual({ reviews: [], error: null });
  });
});

describe("fetchReview", () => {
  it("returns the row when it exists", async () => {
    set({
      "spending_reviews:select": () => ({
        data: row({ id: "rev-9", status: "ready" }),
        error: null,
      }),
    });
    const got = await fetchReview("rev-9");
    expect(got?.id).toBe("rev-9");
    expect(got?.status).toBe("ready");
  });

  it("returns null when there is no such row", async () => {
    set({ "spending_reviews:select": () => ({ data: null, error: null }) });
    expect(await fetchReview("nope")).toBeNull();
  });
});

describe("startCheckout", () => {
  it("returns Stripe's hosted url and sends the window it priced", async () => {
    set({
      "fn:review-checkout": () => ({
        data: { url: "https://checkout.stripe.com/c/pay/cs_test_123", review_id: "rev-1" },
        error: null,
      }),
    });
    const { url, error } = await startCheckout("past_3_months", "LBP", NOW);
    expect(error).toBeNull();
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    expect(mock.supabase.functions.invoke).toHaveBeenCalledWith(
      "review-checkout",
      {
        body: {
          period_id: "past_3_months",
          period_from: JUN_1,
          period_to: SEP_1,
          home_currency: "LBP",
        },
      },
    );
  });

  it("returns the error and no url when the purchase is refused", async () => {
    set({
      "fn:review-checkout": () =>
        fnFails(
          withJson(async () => ({ error: "That period is not finished yet." })),
        ),
    });
    expect(await startCheckout("last_month", "USD", NOW)).toEqual({
      url: null,
      error: "That period is not finished yet.",
    });
  });

  it("returns no url when the function answers without one", async () => {
    set({
      "fn:review-checkout": () => ({ data: { review_id: "rev-1" }, error: null }),
    });
    expect(await startCheckout("last_month", "USD", NOW)).toEqual({
      url: null,
      error: null,
    });
  });

  it("returns no url when the function answers with no data", async () => {
    set({ "fn:review-checkout": () => ({ data: null, error: null }) });
    expect(await startCheckout("last_month", "USD", NOW)).toEqual({
      url: null,
      error: null,
    });
  });
});

describe("generateReview", () => {
  it("sends the locally computed digest and returns the written review", async () => {
    set({
      "fn:generate-review": () => ({ data: { review: review() }, error: null }),
    });
    const { review: got, error } = await generateReview("rev-1", digest);
    expect(error).toBeNull();
    expect(got?.title).toBe("Three months of takeaway");
    expect(got?.sections[0].figures[0]).toEqual({
      label: "Food",
      value: "$412.00",
    });
    expect(mock.supabase.functions.invoke).toHaveBeenCalledWith(
      "generate-review",
      { body: { review_id: "rev-1", digest } },
    );
  });

  it("surfaces the function's refusal", async () => {
    set({
      "fn:generate-review": () =>
        fnFails(
          withJson(async () => ({
            error: "That review used up its attempts.",
          })),
        ),
    });
    expect(await generateReview("rev-1", digest)).toEqual({
      review: null,
      error: "That review used up its attempts.",
    });
  });

  it("rejects a malformed review instead of handing it on", async () => {
    set({
      "fn:generate-review": () => ({
        data: { review: { title: "Half a review", summary: 7 } },
        error: null,
      }),
    });
    expect(await generateReview("rev-1", digest)).toEqual({
      review: null,
      error: "That review came back unreadable.",
    });
  });

  it("rejects an empty reply", async () => {
    set({ "fn:generate-review": () => ({ data: null, error: null }) });
    expect(await generateReview("rev-1", digest)).toEqual({
      review: null,
      error: "That review came back unreadable.",
    });
  });
});

describe("storeReviewBody", () => {
  it("updates the encrypted body and reports no error", async () => {
    set({ "spending_reviews:update": () => ({ data: null, error: null }) });
    expect(await storeReviewBody("rev-1", "iv.ciphertext")).toEqual({
      error: null,
    });
    expect(
      mock.calls.some(
        (c) => c.table === "spending_reviews" && c.op === "update",
      ),
    ).toBe(true);
  });

  it("returns the database's message when the write is refused", async () => {
    set({
      "spending_reviews:update": () => ({
        data: null,
        error: { message: "new row violates row-level security policy" },
      }),
    });
    expect(await storeReviewBody("rev-1", "iv.ciphertext")).toEqual({
      error: "new row violates row-level security policy",
    });
  });
});

describe("reviewPrice", () => {
  it("formats what the row was actually charged", () => {
    expect(reviewPrice(row({ price_cents: 500, price_currency: "USD" }))).toBe(
      "$5.00",
    );
  });

  it("upper-cases Stripe's lowercase currency code", () => {
    // Stripe reports currency in lowercase; without the upper-casing "lbp"
    // is an unknown code and formats as "lbp 895.00" with the wrong decimals.
    expect(
      reviewPrice(row({ price_cents: 89_500, price_currency: "lbp" })),
    ).toBe("LL 895");
    expect(reviewPrice(row({ price_cents: 450, price_currency: "eur" }))).toBe(
      "€4.50",
    );
  });
});

describe("asSpendingReview", () => {
  it("accepts a valid review and keeps only the fields it knows", () => {
    const got = asSpendingReview({
      ...review(),
      sections: [
        {
          heading: "Where it went",
          body: "Food led every month.",
          figures: [{ label: "Food", value: "$412.00", trend: "up" }],
          chart: "pie",
        },
      ],
      prompt_tokens: 1200,
    });
    expect(got).toEqual({
      title: "Three months of takeaway",
      summary: "Spending held steady; food is the story.",
      sections: [
        {
          heading: "Where it went",
          body: "Food led every month.",
          figures: [{ label: "Food", value: "$412.00" }],
        },
      ],
      notables: ["Coffee twice a day in July"],
      caveats: ["August has 6 unlogged days"],
    });
  });

  it("accepts a review with no sections, notables or caveats", () => {
    const got = asSpendingReview({
      title: "Nothing to say",
      summary: "Too little logged.",
      sections: [],
      notables: [],
      caveats: [],
    });
    expect(got?.sections).toEqual([]);
  });

  const rejected: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["a missing title", { ...review(), title: undefined }],
    ["a non-string title", { ...review(), title: 12 }],
    ["a missing summary", { ...review(), summary: undefined }],
    ["a non-string summary", { ...review(), summary: ["a", "b"] }],
    ["sections that are not an array", { ...review(), sections: "one" }],
    ["notables that are not an array", { ...review(), notables: "coffee" }],
    ["notables holding a non-string", { ...review(), notables: ["ok", 3] }],
    ["caveats that are not an array", { ...review(), caveats: null }],
    ["caveats holding a non-string", { ...review(), caveats: [{ text: "x" }] }],
    ["a null section", { ...review(), sections: [null] }],
    [
      "a section with a non-string heading",
      { ...review(), sections: [{ heading: 1, body: "b", figures: [] }] },
    ],
    [
      "a section with a missing body",
      { ...review(), sections: [{ heading: "h", figures: [] }] },
    ],
    [
      "a section whose figures are not an array",
      { ...review(), sections: [{ heading: "h", body: "b", figures: {} }] },
    ],
    [
      "a null figure",
      { ...review(), sections: [{ heading: "h", body: "b", figures: [null] }] },
    ],
    [
      "a figure with a non-string label",
      {
        ...review(),
        sections: [
          { heading: "h", body: "b", figures: [{ label: 5, value: "$1" }] },
        ],
      },
    ],
    [
      "a figure with a non-string value",
      {
        ...review(),
        sections: [
          { heading: "h", body: "b", figures: [{ label: "Food", value: 412 }] },
        ],
      },
    ],
  ];

  for (const [what, value] of rejected) {
    it(`rejects ${what}`, () => {
      expect(asSpendingReview(value)).toBeNull();
    });
  }
});

describe("waitForPaidReview", () => {
  it("returns straight away when the webhook already landed", async () => {
    const read = vi.fn(async () => row({ status: "paid" }));
    const sleep = vi.fn(async () => {});
    const got = await waitForPaidReview("rev-1", { read, sleep });
    expect(got?.status).toBe("paid");
    expect(read).toHaveBeenCalledWith("rev-1");
    expect(read).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("polls through a pending row until the webhook flips it", async () => {
    const answers = [
      row({ status: "pending", paid_at: null }),
      row({ status: "pending", paid_at: null }),
      row({ status: "paid" }),
    ];
    let i = 0;
    const read = vi.fn(async () => answers[i++]);
    const sleep = vi.fn(async () => {});
    const got = await waitForPaidReview("rev-1", { read, sleep, delayMs: 7 });
    expect(got?.status).toBe("paid");
    expect(got?.paid_at).not.toBeNull();
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7);
  });

  it("gives up after the attempt budget and hands back the pending row", async () => {
    const read = vi.fn(async () => row({ status: "pending", paid_at: null }));
    const sleep = vi.fn(async () => {});
    const got = await waitForPaidReview("rev-1", { read, sleep, attempts: 3 });
    expect(got?.status).toBe("pending");
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("stops on a row it cannot see", async () => {
    const read = vi.fn(async () => null);
    const sleep = vi.fn(async () => {});
    expect(await waitForPaidReview("rev-1", { read, sleep })).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits on real time when no sleep is injected", async () => {
    const answers = [row({ status: "pending", paid_at: null }), row({ status: "paid" })];
    let i = 0;
    const read = vi.fn(async () => answers[i++]);
    const got = await waitForPaidReview("rev-1", { read, delayMs: 0 });
    expect(got?.status).toBe("paid");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reads the row itself when nothing is injected", async () => {
    set({
      "spending_reviews:select": () => ({
        data: row({ status: "paid" }),
        error: null,
      }),
    });
    const got = await waitForPaidReview("rev-1");
    expect(got?.status).toBe("paid");
    expect(mock.supabase.from).toHaveBeenCalledWith("spending_reviews");
  });
});
