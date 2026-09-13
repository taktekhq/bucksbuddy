import { describe, expect, it } from "vitest";
import {
  aggregateRecap,
  initialRecapMonth,
  monthKey,
  parseMonth,
  recapName,
  recapTitles,
} from "./recap";
import { recapFixture, recapRow } from "@/test/recapFixture";
const month = new Date(2025, 11, 1);
const aggregate = (rows: ReturnType<typeof recapRow>[]) =>
  aggregateRecap(rows, month);

describe("Recap calculations", () => {
  it("aggregates normalized home cents once and follows ranking over fictional fixed widths", () => {
    const r = aggregate(recapFixture);
    expect(r.total).toBe(60000);
    expect(r.entries).toBe(25);
    expect(r.categories.map((b) => [b.id, b.cents, b.entries])).toEqual([
      ["food", 22800, 22],
      ["groceries", 15000, 1],
      ["parking", 11400, 1],
      ["fun", 10800, 1],
    ]);
    expect(r.split.map((b) => b.percent)).toEqual([38, 25, 37]);
    expect(recapTitles("monthly", r)[0].id).toBe("logged");
  });
  it("handles empty, zero, one and two category months", () => {
    expect(aggregate([])).toEqual({
      total: 0,
      entries: 0,
      categories: [],
      split: [],
    });
    expect(aggregate([recapRow("0", "food", 0)]).entries).toBe(0);
    expect(aggregate([recapRow("1")]).split.map((b) => b.percent)).toEqual([
      100,
    ]);
    expect(
      aggregate([recapRow("1"), recapRow("2", "parking")]).split.map(
        (b) => b.percent,
      ),
    ).toEqual([50, 50]);
  });
  it("excludes income, refunds and Safe; buckets unknown identifiers into Other", () => {
    const r = aggregate([
      recapRow("income", "salary", NaN, { is_income: true }),
      recapRow("refund", "refund", 500, { is_income: true }),
      recapRow("safe", "safe", 3000),
      recapRow("gold", "safe/gold", 4000),
      recapRow("unknown", "secret/category"),
      recapRow("other", "other"),
      recapRow("coffee", "coffee"),
      recapRow("groceries", "groceries"),
    ]);
    expect(r.total).toBe(400);
    expect(r.categories.map((b) => b.id)).toEqual([
      "other",
      "coffee",
      "groceries",
    ]);
    expect(JSON.stringify(r)).not.toContain("secret");
  });
  it("deduplicates IDs and uses local inclusive/exclusive year boundaries", () => {
    const first = recapRow("first", "food", 100, {
      occurred_at: new Date(2025, 11, 1).toISOString(),
    });
    const r = aggregate([
      first,
      first,
      recapRow("before", "food", 100, {
        occurred_at: new Date(2025, 10, 30, 23, 59, 59).toISOString(),
      }),
      recapRow("after", "food", 100, {
        occurred_at: new Date(2026, 0, 1).toISOString(),
      }),
    ]);
    expect(r.total).toBe(100);
  });
  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "blocks invalid expense amount %s",
    (cents) =>
      expect(() => aggregate([recapRow("x", "food", cents)])).toThrow(
        "invalid_data",
      ),
  );
  it("blocks masked, corrupt dates and overflowing totals", () => {
    expect(() =>
      aggregate([recapRow("x", "food", 1, { amountMask: "abc" })]),
    ).toThrow();
    expect(() =>
      aggregate([recapRow("x", "food", 1, { occurred_at: "invalid" })]),
    ).toThrow();
    expect(() =>
      aggregate([
        recapRow("x", "food", Number.MAX_SAFE_INTEGER),
        recapRow("y"),
      ]),
    ).toThrow();
  });
  it("uses stable category ties and largest-remainder displayed-order ties", () => {
    const r = aggregate([
      recapRow("p", "parking"),
      recapRow("f", "food"),
      recapRow("c", "coffee"),
    ]);
    expect(r.split.map((b) => [b.id, b.percent])).toEqual([
      ["coffee", 34],
      ["food", 33],
      ["remainder", 33],
    ]);
    expect(r.categories[0].percent).toBe(34);
    expect(
      aggregate([
        recapRow("f", "food", 334),
        recapRow("p", "parking", 333),
        recapRow("c", "coffee", 333),
      ]).split.map((b) => b.percent),
    ).toEqual([34, 33, 33]);
    expect(
      aggregate([
        recapRow("a", "food", 339),
        recapRow("b", "coffee", 336),
        recapRow("c", "parking", 325),
      ]).split.map((b) => b.percent),
    ).toEqual([34, 34, 32]);
  });
  it("only offers eligible titles, using unrounded shares", () => {
    expect(recapTitles("trading", aggregate([]))[0].id).toBe("collected");
    expect(recapTitles("trading", aggregate([recapRow("x")]))[0].id).toBe(
      "foodie",
    );
    expect(
      recapTitles("trading", aggregate([recapRow("x", "parking")]))[0].id,
    ).toBe("parking");
    for (const rows of [
      [recapRow("f", "food", 900), recapRow("p", "parking", 100)],
      [recapRow("f", "food", 100), recapRow("p", "parking", 900)],
    ])
      expect(recapTitles("monthly", aggregate(rows))[0].id).toBe(
        "hungry_parked",
      );
    expect(
      recapTitles(
        "monthly",
        aggregate([recapRow("f", "food", 901), recapRow("p", "parking", 99)]),
      )[0].id,
    ).toBe("logged");
  });
});

describe("Recap month and name input", () => {
  it("uses full local years and validates month bounds", () => {
    expect(monthKey(month)).toBe("2025-12");
    expect(monthKey()).toMatch(/^\d{4}-\d{2}$/);
    expect(parseMonth("2025-12").getMonth()).toBe(11);
    expect(parseMonth("0099-01").getFullYear()).toBe(99);
    for (const value of ["2025-13", "2025-00", "bad", "9999-12", "0000-01"])
      expect(() => parseMonth(value)).toThrow("month");
    expect(initialRecapMonth("#/recap?month=2025-12")).toBe("2025-12");
    expect(initialRecapMonth("#/recap")).toBe(monthKey());
    expect(initialRecapMonth("#/recap?month=bad")).toBe(monthKey());
  });
  it("trims names as plain text, strips controls and counts Unicode codepoints", () => {
    expect(recapName("  Alex\n\u202e ")).toBe("Alex");
    expect(recapName("🥕".repeat(25))).toBe("🥕".repeat(24));
    expect(recapName("<b>Alex</b>")).toBe("<b>Alex</b>");
  });
});
