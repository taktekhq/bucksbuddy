import { describe, it, expect } from "vitest";
import {
  LONG_GAP_DAYS,
  LOW_COVERAGE,
  MIN_SPEND_ENTRIES,
  coverageRatio,
  describeEligibility,
  type ReportFacts,
} from "@/lib/reportEligibility";

// Dates only ever travel through this module as opaque strings, but they are
// built with the local-time constructor at midday anyway so that nothing here
// depends on the runner's timezone (the app buckets by local calendar day).
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

/**
 * A comfortably-eligible answer from the server's `report_eligibility`: a full
 * three-month window, well over the threshold, logged most days.
 */
function facts(overrides: Partial<ReportFacts> = {}): ReportFacts {
  return {
    periodFrom: "2026-06-01",
    periodTo: "2026-09-01",
    periodDays: 92,
    spendCount: 120,
    entryCount: 137,
    loggedDays: 80,
    longestGapDays: 3,
    firstEntryAt: at(2026, 2, 14),
    coversPeriod: true,
    minSpendEntries: MIN_SPEND_ENTRIES,
    ok: true,
    ...overrides,
  };
}

describe("coverageRatio", () => {
  it("is logged days over days in the period", () => {
    expect(coverageRatio(facts({ periodDays: 92, loggedDays: 46 }))).toBeCloseTo(0.5);
    expect(coverageRatio(facts({ periodDays: 30, loggedDays: 3 }))).toBeCloseTo(0.1);
  });

  it("is 1 when every day in the window carries an entry", () => {
    expect(coverageRatio(facts({ periodDays: 31, loggedDays: 31 }))).toBe(1);
  });

  it("is 0 rather than NaN for a zero-day period", () => {
    // The division guard: 0/0 would poison every comparison downstream.
    const ratio = coverageRatio(facts({ periodDays: 0, loggedDays: 0 }));
    expect(ratio).toBe(0);
    expect(Number.isNaN(ratio)).toBe(false);
  });
});

describe("describeEligibility — the spend-count gate", () => {
  it("passes a comfortable account with no blockers and no warnings", () => {
    const copy = describeEligibility(facts(), "past_3_months");
    expect(copy).toEqual({ ok: true, blockers: [], warnings: [] });
  });

  it("blocks just under the threshold and names the shortfall", () => {
    const copy = describeEligibility(
      facts({ spendCount: 39, minSpendEntries: 40, ok: false }),
      "past_3_months",
    );
    expect(copy.ok).toBe(false);
    expect(copy.blockers).toEqual([
      "40 logged expenses needed — you have 39 in this window, so 1 to go.",
    ]);
  });

  it("quotes the threshold the server applied, not the module's fallback", () => {
    // A deployment whose migration sets a different `min_spend_entries`: the
    // copy has to follow the server or it lies about what unlocks the review.
    const copy = describeEligibility(
      facts({ spendCount: 20, minSpendEntries: 25, ok: false }),
      "past_3_months",
    );
    expect(copy.blockers[0]).toBe(
      "25 logged expenses needed — you have 20 in this window, so 5 to go.",
    );
    expect(copy.blockers[0]).not.toContain(String(MIN_SPEND_ENTRIES));
    expect(MIN_SPEND_ENTRIES).toBe(40);
  });

  it("reads correctly when the threshold itself is 1", () => {
    // The singular arm of the threshold noun: the server's number, so the copy
    // cannot assume it is plural.
    const copy = describeEligibility(
      facts({ spendCount: 0, minSpendEntries: 1, ok: false }),
      "past_3_months",
    );
    expect(copy.blockers[0]).toBe(
      "1 logged expense needed — you have 0 in this window, so 1 to go.",
    );
  });

  it("does not block when the count exactly meets the threshold", () => {
    const copy = describeEligibility(
      facts({ spendCount: 40, minSpendEntries: 40 }),
      "past_3_months",
    );
    expect(copy.blockers).toEqual([]);
    expect(copy.ok).toBe(true);
  });
});

describe("describeEligibility — the history gate", () => {
  it("says there is nothing logged at all when the account is empty", () => {
    const copy = describeEligibility(
      facts({
        spendCount: 0,
        entryCount: 0,
        loggedDays: 0,
        longestGapDays: 92,
        firstEntryAt: null,
        coversPeriod: false,
        ok: false,
      }),
      "past_3_months",
    );
    expect(copy.ok).toBe(false);
    expect(copy.blockers).toContain(
      "No expenses logged yet — a review needs a month of history behind it.",
    );
    // Both hard gates fail for an empty account, and each is spelled out.
    expect(copy.blockers).toHaveLength(2);
    expect(copy.blockers[0]).toContain("40 logged expenses needed");
  });

  it("tells a one-month buyer to wait for the next full month", () => {
    const copy = describeEligibility(
      facts({ coversPeriod: false, firstEntryAt: at(2026, 7, 9), ok: false }),
      "last_month",
    );
    expect(copy.blockers).toEqual([
      "Your history doesn't cover all of last month yet. Give it until the next full month.",
    ]);
  });

  it("points a three-month buyer at the one-month review instead", () => {
    const copy = describeEligibility(
      facts({ coversPeriod: false, firstEntryAt: at(2026, 6, 3), ok: false }),
      "past_3_months",
    );
    expect(copy.blockers).toEqual([
      "Your history doesn't reach back three whole months yet. A one-month review is the one to start with.",
    ]);
    // The two periods must not share one sentence.
    const other = describeEligibility(
      facts({ coversPeriod: false, firstEntryAt: at(2026, 6, 3), ok: false }),
      "last_month",
    );
    expect(other.blockers[0]).not.toBe(copy.blockers[0]);
  });
});

describe("describeEligibility — warnings", () => {
  it("warns about a thin window without blocking the purchase", () => {
    const copy = describeEligibility(
      facts({ periodDays: 92, loggedDays: 20, spendCount: 45 }),
      "past_3_months",
    );
    expect(copy.ok).toBe(true);
    expect(copy.blockers).toEqual([]);
    expect(copy.warnings).toEqual([
      "72 of the 92 days have nothing logged, so the review will be reading a partial picture.",
    ]);
  });

  it("stays quiet once coverage reaches the threshold", () => {
    // Exactly LOW_COVERAGE is not "low" — the check is strictly less-than.
    const onTheLine = facts({ periodDays: 92, loggedDays: 46 });
    expect(coverageRatio(onTheLine)).toBe(LOW_COVERAGE);
    expect(describeEligibility(onTheLine, "past_3_months").warnings).toEqual([]);

    const justUnder = facts({ periodDays: 92, loggedDays: 45 });
    expect(describeEligibility(justUnder, "past_3_months").warnings).toHaveLength(1);
  });

  it("counts the unlogged days, not the logged ones", () => {
    // A single logged day out of thirty: the sentence is phrased from the
    // unlogged side, so the number in it is 29 rather than 1.
    const copy = describeEligibility(
      facts({ periodDays: 30, loggedDays: 1, spendCount: 40 }),
      "last_month",
    );
    expect(copy.warnings[0]).toBe(
      "29 of the 30 days have nothing logged, so the review will be reading a partial picture.",
    );
  });

  it("suppresses the coverage warning entirely when nothing is logged", () => {
    // 0/92 is the lowest coverage there is, but "92 of the 92 days have nothing
    // logged" is noise on top of the blocker that already says the account is
    // empty.
    const copy = describeEligibility(
      facts({
        periodDays: 92,
        loggedDays: 0,
        spendCount: 0,
        longestGapDays: 0,
        firstEntryAt: null,
        coversPeriod: false,
        ok: false,
      }),
      "past_3_months",
    );
    expect(copy.warnings).toEqual([]);
  });

  it("does not flag a gap of exactly LONG_GAP_DAYS", () => {
    expect(LONG_GAP_DAYS).toBe(7);
    const copy = describeEligibility(facts({ longestGapDays: LONG_GAP_DAYS }), "past_3_months");
    expect(copy.warnings).toEqual([]);
  });

  it("flags one day past the boundary", () => {
    const copy = describeEligibility(
      facts({ longestGapDays: LONG_GAP_DAYS + 1 }),
      "past_3_months",
    );
    expect(copy.warnings).toEqual(["8 days in a row have nothing logged."]);
    expect(copy.ok).toBe(true);
  });

  it("can raise both warnings at once", () => {
    const copy = describeEligibility(
      facts({ periodDays: 92, loggedDays: 10, longestGapDays: 40, spendCount: 41 }),
      "past_3_months",
    );
    expect(copy.warnings).toHaveLength(2);
    expect(copy.warnings[0]).toBe(
      "82 of the 92 days have nothing logged, so the review will be reading a partial picture.",
    );
    expect(copy.warnings[1]).toBe("40 days in a row have nothing logged.");
    expect(copy.ok).toBe(true);
  });
});

describe("describeEligibility — the verdict", () => {
  it("refuses when the server says no even with nothing local to point at", () => {
    // The server counts every row the account has; the browser only sees a page
    // of them. Its "no" is final.
    const copy = describeEligibility(facts({ ok: false }), "past_3_months");
    expect(copy.ok).toBe(false);
    expect(copy.blockers).toEqual([]);
    expect(copy.warnings).toEqual([]);
  });

  it("refuses when the server says yes but a blocker is present", () => {
    const copy = describeEligibility(
      facts({ ok: true, spendCount: 3, minSpendEntries: 40 }),
      "past_3_months",
    );
    expect(copy.ok).toBe(false);
    expect(copy.blockers).toHaveLength(1);
  });

  it("is ok only when the server agrees and nothing is blocking", () => {
    expect(describeEligibility(facts(), "last_month").ok).toBe(true);
  });
});
