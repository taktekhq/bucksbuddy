import { describe, it, expect } from "vitest";
import {
  boundDate,
  DEFAULT_REPORT_PERIOD,
  eligibilityFrom,
  isKnownPeriodId,
  isReportPeriodId,
  periodName,
  RECENT_MONTHS,
  REPORT_PERIODS,
  reportPeriodBounds,
  reportPeriodDays,
  reportPeriodLabel,
  reportWindowLabel,
} from "@/lib/reportPeriod";

// A fixed "now" — 8 Sept 2026, midday — built with the local-time constructor so
// the calendar-month maths is deterministic in any timezone and checkable by
// eye: three months back is June, so the recent review reaches 1 June.
const NOW = new Date(2026, 8, 8, 12, 0, 0);

const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("REPORT_PERIODS", () => {
  it("offers two reviews, not a choice of window", () => {
    expect(REPORT_PERIODS.map((p) => p.id)).toEqual([
      "last_3_months",
      "all_time",
    ]);
    expect(REPORT_PERIODS.map((p) => p.label)).toEqual([
      "Recent months",
      "All time",
    ]);
    expect(DEFAULT_REPORT_PERIOD).toBe("last_3_months");
  });

  it("keeps every name and blurb inside 70 characters", () => {
    for (const p of REPORT_PERIODS) {
      expect(p.label.length).toBeLessThanOrEqual(70);
      expect(p.blurb.length).toBeLessThanOrEqual(70);
    }
  });
});

describe("isReportPeriodId", () => {
  it("accepts the two on offer", () => {
    expect(isReportPeriodId("last_3_months")).toBe(true);
    expect(isReportPeriodId("all_time")).toBe(true);
  });

  it("rejects the superseded windows and anything else", () => {
    // Still legal on a stored row — see isKnownPeriodId — but nothing offers
    // them, so they are not choices.
    expect(isReportPeriodId("this_vs_last")).toBe(false);
    expect(isReportPeriodId("last_month")).toBe(false);
    expect(isReportPeriodId("past_3_months")).toBe(false);
    expect(isReportPeriodId(null)).toBe(false);
  });
});

describe("isKnownPeriodId", () => {
  it("accepts the two on offer and the three superseded ones", () => {
    for (const id of [
      "last_3_months",
      "all_time",
      "this_vs_last",
      "last_month",
      "past_3_months",
    ]) {
      expect(isKnownPeriodId(id)).toBe(true);
    }
  });

  it("rejects a window this version has never heard of", () => {
    expect(isKnownPeriodId("this_month")).toBe(false);
    expect(isKnownPeriodId(undefined)).toBe(false);
  });
});

describe("reportPeriodBounds — the recent review", () => {
  it("reaches three whole months back, and runs to this moment", () => {
    const { from, to } = reportPeriodBounds("last_3_months", NOW);
    expect(RECENT_MONTHS).toBe(3);
    expect(day(from)).toBe("2026-06-01");
    expect(from.getHours()).toBe(0);
    // Not the start of this month: the current, unfinished month is inside the
    // window, which is what makes the comparison worth reading.
    expect(to.getTime()).toBe(NOW.getTime());
  });

  it("starts where the logging did when the account is younger than that", () => {
    // "At most three months": an account six weeks old is asked about six weeks,
    // not refused for having too little history.
    const first = new Date(2026, 7, 20, 9, 30).toISOString();
    const { from } = reportPeriodBounds("last_3_months", NOW, first);
    expect(from.toISOString()).toBe(first);
  });

  it("ignores a first entry older than its reach", () => {
    const first = new Date(2024, 0, 5).toISOString();
    const { from } = reportPeriodBounds("last_3_months", NOW, first);
    expect(day(from)).toBe("2026-06-01");
  });
});

describe("reportPeriodBounds — all time", () => {
  it("anchors on the account's first entry", () => {
    const first = new Date(2024, 2, 17, 9, 30).toISOString();
    const { from, to } = reportPeriodBounds("all_time", NOW, first);
    expect(from.toISOString()).toBe(first);
    expect(to.getTime()).toBe(NOW.getTime());
  });

  it("falls back to this month when there is no first entry to anchor on", () => {
    // Under-reporting is the safe wrong answer: it cannot invent history, and
    // the database clamps the real window anyway.
    for (const missing of [null, "not a date"]) {
      const { from } = reportPeriodBounds("all_time", NOW, missing);
      expect(day(from)).toBe("2026-09-01");
    }
  });
});

describe("eligibilityFrom", () => {
  it("sends the recent review's full reach, for the database to clamp", () => {
    expect(eligibilityFrom("last_3_months", NOW)).toBe(
      new Date(2026, 5, 1).toISOString(),
    );
  });

  it("sends null for all time, so the database anchors it", () => {
    // Only the database knows when this account started logging.
    expect(eligibilityFrom("all_time", NOW)).toBeNull();
  });
});

describe("reportPeriodDays", () => {
  it("counts from the window's start to now", () => {
    // June 30 + July 31 + August 31 + 7 days of September + the half day to
    // midday, which rounds up.
    expect(reportPeriodDays("last_3_months", NOW)).toBe(100);
  });

  it("counts from the clamp when the account is younger", () => {
    const first = new Date(2026, 8, 1, 12).toISOString();
    expect(reportPeriodDays("last_3_months", NOW, first)).toBe(7);
    expect(reportPeriodDays("all_time", NOW, first)).toBe(7);
  });

  it("never goes negative on an account whose first entry is in the future", () => {
    const ahead = new Date(2026, 9, 1).toISOString();
    expect(reportPeriodDays("all_time", NOW, ahead)).toBe(0);
  });
});

describe("reportPeriodLabel", () => {
  it("names the months the recent review spans", () => {
    expect(reportPeriodLabel("last_3_months", NOW)).toBe(
      "June 2026 – September 2026",
    );
  });

  it("names the clamped span for a young account", () => {
    const first = new Date(2026, 7, 20).toISOString();
    expect(reportPeriodLabel("last_3_months", NOW, first)).toBe(
      "August 2026 – September 2026",
    );
  });

  it("names where all time starts, once that is known", () => {
    const first = new Date(2024, 2, 17).toISOString();
    expect(reportPeriodLabel("all_time", NOW, first)).toBe(
      "March 2024 – September 2026",
    );
  });

  it("says so plainly while the first entry is unknown", () => {
    expect(reportPeriodLabel("all_time", NOW)).toBe("Everything you've logged");
  });

  it("keeps every label inside 70 characters", () => {
    const first = new Date(2024, 2, 17).toISOString();
    for (const p of REPORT_PERIODS) {
      expect(reportPeriodLabel(p.id, NOW, first).length).toBeLessThanOrEqual(70);
      expect(reportPeriodLabel(p.id, NOW).length).toBeLessThanOrEqual(70);
    }
  });
});

describe("periodName", () => {
  it("names the two on offer", () => {
    expect(periodName("last_3_months")).toBe("Recent months");
    expect(periodName("all_time")).toBe("All time");
  });

  it("still names the superseded windows, for a review stored under one", () => {
    expect(periodName("last_month")).toBe("Last month");
    expect(periodName("this_vs_last")).toBe("This month vs last");
    expect(periodName("past_3_months")).toBe("Past 3 finished months");
  });
});

describe("reportWindowLabel", () => {
  it("names one month when the window is inside one", () => {
    expect(reportWindowLabel(new Date(2026, 7, 1), new Date(2026, 8, 1))).toBe(
      "August 2026",
    );
  });

  it("names both ends when it spans more", () => {
    expect(reportWindowLabel(new Date(2026, 5, 1), new Date(2026, 8, 1))).toBe(
      "June 2026 – August 2026",
    );
  });

  it("reads `to` as exclusive, to the millisecond", () => {
    expect(
      reportWindowLabel(new Date(2026, 7, 1), new Date(2026, 8, 1, 0, 0, 0, 0)),
    ).toBe("August 2026");
    expect(
      reportWindowLabel(new Date(2026, 7, 1), new Date(2026, 8, 8, 12)),
    ).toBe("August 2026 – September 2026");
  });
});

describe("boundDate", () => {
  it("formats a local calendar date, zero-padded", () => {
    expect(boundDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(boundDate(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });
});
