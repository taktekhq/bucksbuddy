import { describe, it, expect } from "vitest";
import {
  SIMILARITY_THRESHOLD,
  normalizeNote,
  noteSuggestions,
  noteTokens,
  notesMatch,
  parseNote,
  similarity,
} from "@/lib/notes";
import type { Transaction } from "@/types/db";

describe("parseNote", () => {
  it("peels a cadence hint off the note, brackets and all", () => {
    expect(parseNote("Domain (yearly)")).toEqual({ text: "Domain", cadence: "yearly" });
    expect(parseNote("[monthly] Gym")).toEqual({ text: "Gym", cadence: "monthly" });
    expect(parseNote("cleaner every 2 weeks")).toEqual({ text: "cleaner", cadence: "biweekly" });
    expect(parseNote("bi-weekly cleaner")).toEqual({ text: "cleaner", cadence: "biweekly" });
    expect(parseNote("Weekly groceries")).toEqual({ text: "groceries", cadence: "weekly" });
    expect(parseNote("insurance - annual")).toEqual({ text: "insurance", cadence: "yearly" });
  });

  it("leaves a note without a hint alone, and copes with null", () => {
    expect(parseNote("Netflix")).toEqual({ text: "Netflix", cadence: null });
    expect(parseNote(null)).toEqual({ text: "", cadence: null });
    expect(parseNote("  spaced   out  ")).toEqual({ text: "spaced out", cadence: null });
  });

  it("can leave nothing but the hint", () => {
    expect(parseNote("(yearly)")).toEqual({ text: "", cadence: "yearly" });
  });
});

describe("normalizeNote / noteTokens", () => {
  it("lowercases, strips accents and folds punctuation", () => {
    expect(normalizeNote("  Café-Crème, Netflix!! ")).toBe("cafe creme netflix");
  });

  it("keeps only the meaningful words", () => {
    expect(noteTokens("the netflix bill for us")).toEqual(["netflix"]);
  });
});

describe("similarity", () => {
  it("is 1 for equal strings and 0 for strings too short to compare", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("a", "ab")).toBe(0);
  });

  it("is high for a typo and low for unrelated words", () => {
    expect(similarity("netflix", "netflx")).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    expect(similarity("netflix", "spotify")).toBeLessThan(SIMILARITY_THRESHOLD);
  });
});

describe("notesMatch", () => {
  it("matches equal, contained, word-sharing and typo'd notes", () => {
    expect(notesMatch("netflix", "netflix")).toBe(true);
    expect(notesMatch("netflix", "netflix sub")).toBe(true);
    expect(notesMatch("netflix family plan", "family plan on netflix")).toBe(true);
    expect(notesMatch("netlfix", "netflix")).toBe(true);
  });

  it("does not match on a stopword alone, or on a short fragment", () => {
    expect(notesMatch("netflix bill", "gym bill")).toBe(false);
    expect(notesMatch("ab", "abc")).toBe(false);
  });

  it("treats empty notes as their own thing", () => {
    expect(notesMatch("", "")).toBe(true);
    expect(notesMatch("", "netflix")).toBe(false);
    expect(notesMatch("netflix", "")).toBe(false);
  });
});

describe("noteSuggestions", () => {
  const row = (
    id: string,
    note: string | null,
    occurred_at: string,
    extra: Partial<Transaction> = {},
  ) =>
    ({
      id,
      note,
      occurred_at,
      is_income: false,
      category: "fees/subscriptions",
      ...extra,
    }) as unknown as Transaction;

  const rows = [
    row("a", "Netflix", "2026-06-01T12:00:00.000Z"),
    row("b", "Spotify", "2026-06-12T12:00:00.000Z"),
    row("c", "netflix", "2026-05-01T12:00:00.000Z"), // same note, older casing
    row("d", null, "2026-06-20T12:00:00.000Z"),
    row("e", "   ", "2026-06-21T12:00:00.000Z"),
    row("f", "Mobile top-up", "2026-06-22T12:00:00.000Z", { category: "fees/mobile" }),
    row("g", "Salary", "2026-06-25T12:00:00.000Z", { is_income: true, category: "salary" }),
    row("h", "Groceries", "2026-06-26T12:00:00.000Z", { category: "groceries" }),
  ];

  it("offers the distinct past notes of the base category, newest first", () => {
    expect(
      noteSuggestions(rows, { isIncome: false, category: "fees/subscriptions", query: "" }),
    ).toEqual(["Mobile top-up", "Spotify", "Netflix"]);
  });

  it("narrows to what's typed and drops an exact match", () => {
    const opts = { isIncome: false, category: "fees" };
    expect(noteSuggestions(rows, { ...opts, query: "net" })).toEqual(["Netflix"]);
    expect(noteSuggestions(rows, { ...opts, query: "NETFLIX" })).toEqual([]);
    expect(noteSuggestions(rows, { ...opts, query: "zzz" })).toEqual([]);
  });

  it("respects the limit", () => {
    expect(
      noteSuggestions(rows, { isIncome: false, category: "fees", query: "", limit: 1 }),
    ).toEqual(["Mobile top-up"]);
  });
});
