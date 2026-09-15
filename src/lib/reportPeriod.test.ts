import { describe, it, expect } from "vitest";
import {
  boundDate,
  DEFAULT_REPORT_PERIOD,
  eligibilityFrom,
  isKnownPeriodId,
  isReportPeriodId,
  REPORT_PERIODS,
  reportPeriodBounds,
  reportPeriodDays,
  reportPeriodLabel,
  reportWindowLabel,
} from "@/lib/reportPeriod";

// A fixed "now" — 8 Sept 2026, midday — built with the local-time constructor so
// the calendar-month maths is deterministic in any timezone and checkable by
// eye: last month is August, the two months before this one are July and August.
const NOW = new Date(2026, 8, 8, 12, 0, 0);

const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("REPORT_PERIODS", () => {
  it("offers the comparison, the quarter and all time, in that order", () => {
    expect(REPORT_PERIODS.map((p) => p.id)).toEqual([
      "this_vs_last",
      "last_3_months",
      "all_time",
    ]);
    expect(REPORT_PERIODS.map((p) => p.label)).toEqual([
      "This month vs last",
      "Past 3 months",
      "All time",
    ]);
  });

  it("opens on the comparison", () => {
    expect(DEFAULT_REPORT_PERIOD).toBe("this_vs_last");
    expect(isReportPeriodId(DEFAULT_REPORT_PERIOD)).toBe(true);
  });

  it("keeps every label inside 70 characters", () => {
    for (const p of REPORT_PERIODS) expect(p.label.length).toBeLessThanOrEqual(70);
  });
});

describe("isReportPeriodId", () => {
  it("accepts the three on offer", () => {
    expect(isReportPeriodId("this_vs_last")).toBe(true);
    expect(isReportPeriodId("last_3_months")).toBe(true);
    expect(isReportPeriodId("all_time")).toBe(true);
  });

  it("rejects the superseded windows and anything else", () => {
    // These are still legal on a stored row — see isKnownPeriodId — but nothing
    // offers them now, so the picker must not treat them as choices.
    expect(isReportPeriodId("last_month")).toBe(false);
    expect(isReportPeriodId("past_3_months")).toBe(false);
    expect(isReportPeriodId("this_month")).toBe(false);
    expect(isReportPeriodId(null)).toBe(false);
  });
});

describe("isKnownPeriodId", () => {
  it("accepts the three on offer and the two superseded ones", () => {
    // A review stored before the windows changed still has to open.
    for (const id of [
      "this_vs_last",
      "last_3_months",
      "all_time",
      "last_month",
      "past_3_months",
    ]) {
      expect(isKnownPeriodId(id)).toBe(true);
    }
  });

  it("rejects a window this version has never heard of", () => {
    expect(isKnownPeriodId("this_month")).toBe(false);
    expect(isKnownPeriodId("next_year")).toBe(false);
    expect(isKnownPeriodId(undefined)).toBe(false);
  });
});

describe("reportPeriodBounds", () => {
  it("runs the comparison from the first of last month to this moment", () => {
    const { from, to } = reportPeriodBounds("this_vs_last", NOW);
    expect(day(from)).toBe("2026-08-01");
    expect(from.getHours()).toBe(0);
    // `to` is now, not the start of this month: that is what puts the current,
    // unfinished month inside the window.
    expect(to.getTime()).toBe(NOW.getTime());
  });

  it("runs the quarter from the first of the month two back", () => {
    const { from, to } = reportPeriodBounds("last_3_months", NOW);
    expect(day(from)).toBe("2026-07-01");
    expect(to.getTime()).toBe(NOW.getTime());
  });

  it("anchors all time on the account's first entry", () => {
    const first = new Date(2024, 2, 17, 9, 30).toISOString();
    const { from, to } = reportPeriodBounds("all_time", NOW, first);
    expect(from.toISOString()).toBe(first);
    expect(to.getTime()).toBe(NOW.getTime());
  });

  it("falls back to this month when there is no first entry to anchor on", () => {
    // Under-reporting is the safe wrong answer: it cannot invent history.
    for (const missing of [null, "not a date"]) {
      const { from } = reportPeriodBounds("all_time", NOW, missing);
      expect(day(from)).toBe("2026-09-01");
    }
  });
});

describe("eligibilityFrom", () => {
  it("sends the window's start for a dated window", () => {
    expect(eligibilityFrom("this_vs_last", NOW)).toBe(
      new Date(2026, 7, 1).toISOString(),
    );
    expect(eligibilityFrom("last_3_months", NOW)).toBe(
      new Date(2026, 6, 1).toISOString(),
    );
  });

  it("sends null for all time, so the database anchors it", () => {
    // Only the database knows when this account started logging.
    expect(eligibilityFrom("all_time", NOW)).toBeNull();
  });
});

describe("reportPeriodDays", () => {
  it("counts from the window's start to now", () => {
    // 31 days of August + 7 whole days of September + the half day to midday,
    // which rounds up.
    expect(reportPeriodDays("this_vs_last", NOW)).toBe(39);
    // July (31) and August (31) as well.
    expect(reportPeriodDays("last_3_months", NOW)).toBe(70);
  });

  it("measures all time from the first entry", () => {
    const first = new Date(2026, 8, 1, 12).toISOString();
    expect(reportPeriodDays("all_time", NOW, first)).toBe(7);
  });

  it("never goes negative on an account whose first entry is in the future", () => {
    const ahead = new Date(2026, 9, 1).toISOString();
    expect(reportPeriodDays("all_time", NOW, ahead)).toBe(0);
  });
});

describe("reportPeriodLabel", () => {
  it("names the months a dated window spans", () => {
    expect(reportPeriodLabel("this_vs_last", NOW)).toBe(
      "August 2026 – September 2026",
    );
    expect(reportPeriodLabel("last_3_months", NOW)).toBe(
      "July 2026 – September 2026",
    );
  });

  it("names where all time starts, once that is known", () => {
    const first = new Date(2024, 2, 17).toISOString();
    expect(reportPeriodLabel("all_time", NOW, first)).toBe("Since March 2024");
  });

  it("says so plainly while the first entry is unknown", () => {
    expect(reportPeriodLabel("all_time", NOW)).toBe("Everything you've logged");
    expect(reportPeriodLabel("all_time", NOW, "not a date")).toBe(
      "Everything you've logged",
    );
  });

  it("keeps every label inside 70 characters", () => {
    const first = new Date(2024, 2, 17).toISOString();
    for (const p of REPORT_PERIODS) {
      expect(reportPeriodLabel(p.id, NOW, first).length).toBeLessThanOrEqual(70);
    }
  });
});

describe("reportWindowLabel", () => {
  it("names one month when the window is inside one", () => {
    expect(
      reportWindowLabel(new Date(2026, 7, 1), new Date(2026, 8, 1)),
    ).toBe("August 2026");
  });

  it("names both ends when it spans more", () => {
    expect(
      reportWindowLabel(new Date(2026, 5, 1), new Date(2026, 8, 1)),
    ).toBe("June 2026 – August 2026");
  });

  it("reads `to` as exclusive, to the millisecond", () => {
    // A window ending at midnight on 1 September covers August, not September —
    // and one ending mid-September covers September.
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
