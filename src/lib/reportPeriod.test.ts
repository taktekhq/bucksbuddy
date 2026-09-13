import { describe, it, expect } from "vitest";
import {
  boundDate,
  DEFAULT_REPORT_PERIOD,
  isReportPeriodId,
  REPORT_PERIODS,
  reportPeriodBounds,
  reportPeriodDays,
  reportPeriodLabel,
  reportWindowLabel,
} from "@/lib/reportPeriod";
import { exportRangeBounds } from "@/lib/exportRange";

// A fixed "now" (08 Sep 2026), built with the local-time constructor at midday
// so the whole-calendar-month maths is deterministic in any timezone and
// checkable by eye: last month is August, the past 3 months are June–August.
const NOW = new Date(2026, 8, 8, 12, 0, 0);

const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("REPORT_PERIODS", () => {
  it("offers exactly last month and the past 3 months, in that order", () => {
    expect(REPORT_PERIODS.map((p) => p.id)).toEqual(["last_month", "past_3_months"]);
    expect(REPORT_PERIODS.map((p) => p.label)).toEqual(["Last month", "Past 3 months"]);
  });

  it("points each period at the export range that defines its bounds", () => {
    expect(REPORT_PERIODS.map((p) => p.range)).toEqual(["last_month", "past_3_months"]);
  });

  it("opens on the three-month period", () => {
    expect(DEFAULT_REPORT_PERIOD).toBe("past_3_months");
    expect(isReportPeriodId(DEFAULT_REPORT_PERIOD)).toBe(true);
  });
});

describe("isReportPeriodId", () => {
  it("accepts the two real ids", () => {
    expect(isReportPeriodId("last_month")).toBe(true);
    expect(isReportPeriodId("past_3_months")).toBe(true);
  });

  it("rejects export ranges that are not offered as reviews", () => {
    // Both are valid ExportRangeIds, so this is the interesting rejection: a
    // review never covers a partial month or all of history.
    expect(isReportPeriodId("this_month")).toBe(false);
    expect(isReportPeriodId("all_time")).toBe(false);
  });

  it("rejects junk of any type", () => {
    expect(isReportPeriodId("")).toBe(false);
    expect(isReportPeriodId(null)).toBe(false);
    expect(isReportPeriodId(undefined)).toBe(false);
    expect(isReportPeriodId(3)).toBe(false);
    expect(isReportPeriodId({ id: "last_month" })).toBe(false);
  });
});

describe("reportPeriodBounds", () => {
  it("covers the whole of last month, and none of the current one", () => {
    const { from, to } = reportPeriodBounds("last_month", NOW);
    expect(day(from)).toBe("2026-08-01");
    expect(day(to)).toBe("2026-09-01");
    // Half-open: midnight-to-midnight, so the last instant of August is in.
    expect(from.getHours()).toBe(0);
    expect(to.getTime() - 1).toBeGreaterThan(from.getTime());
    expect(day(new Date(to.getTime() - 1))).toBe("2026-08-31");
  });

  it("covers three whole months ending with last month, excluding September", () => {
    const { from, to } = reportPeriodBounds("past_3_months", NOW);
    expect(day(from)).toBe("2026-06-01");
    expect(day(to)).toBe("2026-09-01");
    // The partial current month is deliberately out: `to` is at or before NOW.
    expect(to.getTime()).toBeLessThan(NOW.getTime());
  });

  it("steps back over a year boundary", () => {
    const jan = new Date(2026, 0, 20, 12, 0, 0);
    expect(day(reportPeriodBounds("last_month", jan).from)).toBe("2025-12-01");
    expect(day(reportPeriodBounds("last_month", jan).to)).toBe("2026-01-01");
    expect(day(reportPeriodBounds("past_3_months", jan).from)).toBe("2025-10-01");
    expect(day(reportPeriodBounds("past_3_months", jan).to)).toBe("2026-01-01");
  });

  it("is the same window the CSV/PDF export uses, so both describe the same rows", () => {
    for (const p of REPORT_PERIODS) {
      const mine = reportPeriodBounds(p.id, NOW);
      const theirs = exportRangeBounds(p.range, NOW);
      expect(mine.from.getTime()).toBe(theirs.from!.getTime());
      expect(mine.to.getTime()).toBe(theirs.to!.getTime());
    }
  });

  it("does not move as the current month wears on", () => {
    const early = reportPeriodBounds("past_3_months", new Date(2026, 8, 1, 0, 30, 0));
    const late = reportPeriodBounds("past_3_months", new Date(2026, 8, 30, 23, 30, 0));
    expect(early.from.getTime()).toBe(late.from.getTime());
    expect(early.to.getTime()).toBe(late.to.getTime());
  });
});

describe("reportPeriodDays", () => {
  it("counts the real length of a 31-day last month", () => {
    expect(reportPeriodDays("last_month", NOW)).toBe(31); // August
  });

  it("counts a 30-day last month", () => {
    expect(reportPeriodDays("last_month", new Date(2026, 6, 4, 12))).toBe(30); // June
  });

  it("counts a short February, and a leap one", () => {
    expect(reportPeriodDays("last_month", new Date(2026, 2, 10, 12))).toBe(28); // Feb 2026
    expect(reportPeriodDays("last_month", new Date(2024, 2, 10, 12))).toBe(29); // Feb 2024
  });

  it("sums three months of differing lengths", () => {
    // June 30 + July 31 + August 31.
    expect(reportPeriodDays("past_3_months", NOW)).toBe(92);
  });

  it("sums a three-month window that crosses a 28-day February", () => {
    // Jan 31 + Feb 28 + Mar 31, asked in April 2026.
    expect(reportPeriodDays("past_3_months", new Date(2026, 3, 15, 12))).toBe(90);
  });

  it("sums a three-month window that crosses a leap February", () => {
    // Jan 31 + Feb 29 + Mar 31, asked in April 2024 — one day more than 2026.
    expect(reportPeriodDays("past_3_months", new Date(2024, 3, 15, 12))).toBe(91);
  });

  it("agrees with the bounds it is derived from", () => {
    const { from, to } = reportPeriodBounds("past_3_months", NOW);
    const days = reportPeriodDays("past_3_months", NOW);
    expect(day(new Date(from.getTime() + days * 86_400_000))).toBe(day(to));
  });
});

describe("reportPeriodLabel", () => {
  it("names the single month it covers", () => {
    expect(reportPeriodLabel("last_month", NOW)).toBe("Last month · August 2026");
  });

  it("names the first and last month of a span", () => {
    expect(reportPeriodLabel("past_3_months", NOW)).toBe(
      "Past 3 months · June 2026 – August 2026",
    );
  });

  it("crosses the year boundary in both forms", () => {
    const jan = new Date(2026, 0, 20, 12, 0, 0);
    expect(reportPeriodLabel("last_month", jan)).toBe("Last month · December 2025");
    expect(reportPeriodLabel("past_3_months", jan)).toBe(
      "Past 3 months · October 2025 – December 2025",
    );
  });
});

describe("reportWindowLabel", () => {
  it("names one month when the window is one month", () => {
    const { from, to } = reportPeriodBounds("last_month", NOW);
    expect(reportWindowLabel(from, to)).toBe("August 2026");
  });

  it("spans first to last month of a longer window", () => {
    const { from, to } = reportPeriodBounds("past_3_months", NOW);
    expect(reportWindowLabel(from, to)).toBe("June 2026 – August 2026");
  });

  it("reads the last month INSIDE the exclusive end bound", () => {
    // `to` is 01 Sep, which belongs to no part of the window, so the label must
    // say August rather than September.
    expect(reportWindowLabel(new Date(2026, 7, 1), new Date(2026, 8, 1))).toBe("August 2026");
    expect(reportWindowLabel(new Date(2026, 5, 1), new Date(2026, 8, 1))).toBe(
      "June 2026 – August 2026",
    );
  });

  it("is absolute, so a stored review keeps its name whatever today is", () => {
    const { from, to } = reportPeriodBounds("last_month", NOW);
    const label = reportWindowLabel(from, to);
    // A year later the relative picker label has moved on; this one has not.
    expect(reportPeriodLabel("last_month", new Date(2027, 8, 8, 12))).not.toContain("August 2026");
    expect(label).toBe("August 2026");
  });

  it("spans a year boundary", () => {
    expect(reportWindowLabel(new Date(2025, 9, 1), new Date(2026, 0, 1))).toBe(
      "October 2025 – December 2025",
    );
  });
});

describe("boundDate", () => {
  it("renders a local calendar date", () => {
    expect(boundDate(new Date(2026, 7, 31, 12))).toBe("2026-08-31");
  });

  it("zero-pads a single-digit month and day", () => {
    expect(boundDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  it("renders the exclusive end bound at local midnight without slipping a day", () => {
    const { to } = reportPeriodBounds("last_month", NOW);
    expect(boundDate(to)).toBe("2026-09-01");
  });
});
