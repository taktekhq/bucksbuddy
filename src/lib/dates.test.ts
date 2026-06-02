import { describe, it, expect } from "vitest";
import { currentMonthRange, monthLabel } from "@/lib/dates";

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
