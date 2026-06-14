import { describe, it, expect } from "vitest";
import { currentMonthRange, dayKey, dayLabel, isToday, monthLabel } from "@/lib/dates";

describe("currentMonthRange", () => {
  it("returns the first of this month and the first of next month", () => {
    const now = new Date(2026, 5, 15, 13, 30); // 15 Jun 2026
    const { from, to } = currentMonthRange(now);
    expect(from).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
  });

  it("rolls over the year at December", () => {
    const { to } = currentMonthRange(new Date(2026, 11, 10));
    expect(to).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0));
  });

  it("defaults to the real current date", () => {
    const { from, to } = currentMonthRange();
    expect(from.getDate()).toBe(1);
    expect(to.getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("monthLabel", () => {
  it("formats as full month and year", () => {
    expect(monthLabel(new Date(2026, 5, 2))).toBe("June 2026");
  });

  it("defaults to the real current date", () => {
    expect(typeof monthLabel()).toBe("string");
  });
});

describe("isToday", () => {
  const now = new Date(2026, 5, 15, 13, 30); // 15 Jun 2026, local

  it("is true for any time on the same local day", () => {
    expect(isToday(new Date(2026, 5, 15, 0, 0).toISOString(), now)).toBe(true);
    expect(isToday(new Date(2026, 5, 15, 23, 59).toISOString(), now)).toBe(true);
  });

  it("is false for yesterday and tomorrow", () => {
    expect(isToday(new Date(2026, 5, 14, 13, 30).toISOString(), now)).toBe(false);
    expect(isToday(new Date(2026, 5, 16, 13, 30).toISOString(), now)).toBe(false);
  });

  it("is false for the same day-number in another month or year", () => {
    expect(isToday(new Date(2026, 6, 15, 13, 30).toISOString(), now)).toBe(false);
    expect(isToday(new Date(2025, 5, 15, 13, 30).toISOString(), now)).toBe(false);
  });

  it("defaults to the real current date", () => {
    expect(isToday(new Date().toISOString())).toBe(true);
  });
});

describe("dayKey", () => {
  it("uses the local calendar day, zero-padded", () => {
    expect(dayKey(new Date(2026, 5, 3, 12, 0).toISOString())).toBe("2026-06-03");
  });

  it("buckets every time on a local day under the same key", () => {
    const early = dayKey(new Date(2026, 5, 15, 0, 1).toISOString());
    const late = dayKey(new Date(2026, 5, 15, 23, 59).toISOString());
    expect(early).toBe("2026-06-15");
    expect(late).toBe("2026-06-15");
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 5, 15, 13, 30); // 15 Jun 2026, local

  it("labels the current and previous local day", () => {
    expect(dayLabel(new Date(2026, 5, 15, 8, 0).toISOString(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 5, 14, 8, 0).toISOString(), now)).toBe("Yesterday");
  });

  it("uses month + day for older days in the same year", () => {
    expect(dayLabel(new Date(2026, 5, 12, 8, 0).toISOString(), now)).toBe("Jun 12");
  });

  it("includes the year for a different year", () => {
    expect(dayLabel(new Date(2025, 11, 31, 8, 0).toISOString(), now)).toBe("Dec 31, 2025");
  });
});
