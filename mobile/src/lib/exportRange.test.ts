import {
  DEFAULT_EXPORT_RANGE,
  EXPORT_RANGES,
  exportFilename,
  exportRangeBounds,
  exportRangeLabel,
  filterByExportRange,
  type ExportRangeId,
} from "@/lib/exportRange";
import type { Transaction } from "@/types/db";

// A fixed "now" so the whole-calendar-month maths is checkable by eye.
const NOW = new Date(2026, 8, 8, 12, 0, 0); // 08 Sep 2026

const day = (d: Date | null) =>
  d === null
    ? "null"
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function tx(occurred: Date, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1000,
    original_currency: "USD",
    original_amount: 10,
    rate_used: 89500,
    occurred_at: occurred.toISOString(),
    note: null,
    created_at: occurred.toISOString(),
    ...overrides,
  };
}

describe("exportRangeBounds", () => {
  it("covers the current, partial month", () => {
    const { from, to } = exportRangeBounds("this_month", NOW);
    expect(day(from)).toBe("2026-09-01");
    expect(day(to)).toBe("2026-10-01");
  });

  it("covers the whole of the previous month", () => {
    const { from, to } = exportRangeBounds("last_month", NOW);
    expect(day(from)).toBe("2026-08-01");
    expect(day(to)).toBe("2026-09-01");
  });

  it("covers three whole months and stops before the current one", () => {
    const { from, to } = exportRangeBounds("past_3_months", NOW);
    expect(day(from)).toBe("2026-06-01");
    expect(day(to)).toBe("2026-09-01");
  });

  it("is unbounded for all time", () => {
    expect(exportRangeBounds("all_time", NOW)).toEqual({ from: null, to: null });
  });

  it("crosses the new year correctly", () => {
    const jan = new Date(2026, 0, 15, 12, 0, 0);
    expect(day(exportRangeBounds("last_month", jan).from)).toBe("2025-12-01");
    expect(day(exportRangeBounds("past_3_months", jan).from)).toBe("2025-10-01");
    expect(day(exportRangeBounds("past_3_months", jan).to)).toBe("2026-01-01");
  });

  it("defaults to the real current date", () => {
    expect(exportRangeBounds("this_month").from).toBeInstanceOf(Date);
  });
});

describe("exportRangeLabel", () => {
  it("names the month for the two single-month ranges", () => {
    expect(exportRangeLabel("this_month", NOW)).toBe("This month · September 2026");
    expect(exportRangeLabel("last_month", NOW)).toBe("Last month · August 2026");
  });

  it("spans first to last month for the three-month range", () => {
    expect(exportRangeLabel("past_3_months", NOW)).toBe(
      "Past 3 months · June 2026 – August 2026",
    );
  });

  it("has nothing to qualify for all time", () => {
    expect(exportRangeLabel("all_time", NOW)).toBe("All time");
  });

  it("defaults to the real current date", () => {
    expect(exportRangeLabel("all_time")).toBe("All time");
  });
});

describe("filterByExportRange", () => {
  // One row on each side of every boundary that matters.
  const rows = [
    tx(new Date(2026, 8, 1, 0, 0, 0, 0)), // Sep 1, first instant
    tx(new Date(2026, 7, 31, 23, 59, 59, 999)), // Aug 31, last instant
    tx(new Date(2026, 7, 1, 0, 0, 0, 0)), // Aug 1
    tx(new Date(2026, 5, 1, 0, 0, 0, 0)), // Jun 1
    tx(new Date(2026, 4, 31, 23, 59, 59, 999)), // May 31 — just outside
  ];

  it("includes the first instant of the month and excludes the next", () => {
    expect(filterByExportRange(rows, "this_month", NOW)).toHaveLength(1);
  });

  it("takes the whole previous month", () => {
    expect(filterByExportRange(rows, "last_month", NOW)).toHaveLength(2);
  });

  it("takes three months and stops", () => {
    expect(filterByExportRange(rows, "past_3_months", NOW)).toHaveLength(3);
  });

  it("passes everything through for all time", () => {
    expect(filterByExportRange(rows, "all_time", NOW)).toBe(rows);
  });

  it("preserves the given order", () => {
    const picked = filterByExportRange(rows, "past_3_months", NOW);
    expect(picked).toEqual([rows[1], rows[2], rows[3]]);
  });

  it("defaults to the real current date", () => {
    expect(filterByExportRange([], "this_month")).toEqual([]);
  });
});

describe("exportFilename", () => {
  it("names the range and the day it was taken", () => {
    expect(exportFilename("last_month", "csv", NOW)).toBe(
      "bucksbuddy-last-month-2026-09-08.csv",
    );
    expect(exportFilename("past_3_months", "pdf", NOW)).toBe(
      "bucksbuddy-past-3-months-2026-09-08.pdf",
    );
  });

  it("zero-pads month and day", () => {
    expect(exportFilename("all_time", "csv", new Date(2026, 0, 5, 12))).toBe(
      "bucksbuddy-all-time-2026-01-05.csv",
    );
  });

  it("defaults to the real current date", () => {
    expect(exportFilename("this_month", "csv")).toMatch(
      /^bucksbuddy-this-month-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });
});

describe("the range list", () => {
  it("offers the four ranges, defaulting to this month", () => {
    expect(EXPORT_RANGES.map((r) => r.id)).toEqual([
      "this_month",
      "last_month",
      "past_3_months",
      "all_time",
    ] satisfies ExportRangeId[]);
    expect(DEFAULT_EXPORT_RANGE).toBe("this_month");
  });
});
