import { describe, it, expect } from "vitest";
import {
  TYPO_DISTANCE,
  editDistance,
  namesMatch,
  noteName,
  normalizeNote,
  noteSuggestions,
  noteTokens,
  notesMatch,
  parseNote,
} from "@/lib/notes";
import type { Transaction } from "@/types/db";

describe("parseNote", () => {
  const plain = { recurring: false, ended: false, tag: "" };

  it("peels a cadence hint off the note, brackets and all", () => {
    expect(parseNote("Insurance (yearly)")).toEqual({ ...plain, text: "Insurance", cadence: "yearly" });
    expect(parseNote("[monthly] Gym")).toEqual({ ...plain, text: "Gym", cadence: "monthly" });
    expect(parseNote("cleaner every 2 weeks")).toEqual({ ...plain, text: "cleaner", cadence: "biweekly" });
    expect(parseNote("bi-weekly cleaner")).toEqual({ ...plain, text: "cleaner", cadence: "biweekly" });
    expect(parseNote("Weekly groceries")).toEqual({ ...plain, text: "groceries", cadence: "weekly" });
    expect(parseNote("insurance - annual")).toEqual({ ...plain, text: "insurance", cadence: "yearly" });
  });

  it("leaves a note without a hint alone, and copes with null", () => {
    expect(parseNote("Netflix")).toEqual({ ...plain, text: "Netflix", cadence: null });
    expect(parseNote(null)).toEqual({ ...plain, text: "", cadence: null });
    expect(parseNote("  spaced   out  ")).toEqual({ ...plain, text: "spaced out", cadence: null });
  });

  it("can leave nothing but the hint", () => {
    expect(parseNote("(yearly)")).toEqual({ ...plain, text: "", cadence: "yearly" });
  });

  it("spots 'subscription' / 'membership' as recurring, and drops them from the name", () => {
    expect(parseNote("Claude subscription")).toEqual({ ...plain, text: "Claude", cadence: null, recurring: true });
    expect(parseNote("Gym Membership (yearly)")).toEqual({ ...plain, text: "Gym", cadence: "yearly", recurring: true });
    expect(parseNote("subscription")).toEqual({ ...plain, text: "", cadence: null, recurring: true });
  });

  it("takes a domain name as yearly, keeping the hostname but not the word", () => {
    expect(parseNote("sillyguy.com subscription")).toEqual({ ...plain, text: "sillyguy.com", cadence: "yearly", recurring: true });
    expect(parseNote("Domain: redcarnet.com")).toEqual({ ...plain, text: "redcarnet.com", cadence: "yearly", recurring: true });
    expect(parseNote("closet.ai domain (monthly)")).toEqual({ ...plain, text: "closet.ai", cadence: "monthly", recurring: true });
    expect(parseNote("Coffee at dot.com café").cadence).toBe("yearly"); // looks like a host; the trade-off
  });

  it("spots '(ended)' and drops it from the name", () => {
    expect(parseNote("Framer subscription (ended)")).toEqual({ ...plain, text: "Framer", cadence: null, recurring: true, ended: true });
    expect(parseNote("Gym cancelled")).toEqual({ ...plain, text: "Gym", cadence: null, ended: true });
  });

  it("drops who it was 'with' — the name isn't what it was", () => {
    expect(parseNote("Dinner with Sara")).toEqual({ ...plain, text: "Dinner", cadence: null });
    expect(parseNote("Netflix with Ali (monthly)")).toEqual({ ...plain, text: "Netflix", cadence: "monthly" });
    expect(parseNote("Withdrawal").text).toBe("Withdrawal"); // whole word only
  });

  it("reads the brackets the cheat codes left behind as a tag, keeping them in the name", () => {
    expect(parseNote("Claude (taktekbot) (monthly)")).toEqual({
      ...plain,
      text: "Claude (taktekbot)",
      cadence: "monthly",
      tag: "taktekbot",
    });
    // A hint or "(ended)" is not a tag — it's already gone by then.
    expect(parseNote("Insurance (yearly)").tag).toBe("");
    expect(parseNote("Framer subscription (ended)").tag).toBe("");
    expect(parseNote("[monthly] Gym").tag).toBe("");
    // Several tags read as one, normalized like any other note text.
    expect(parseNote("Netflix (Türkiye) (Ali's)").tag).toBe("turkiye ali s");
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

describe("editDistance", () => {
  it("counts inserts, deletes, replacements and swaps as one edit each", () => {
    expect(TYPO_DISTANCE).toBe(1);
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("netflix", "netflx")).toBe(1); // missed letter
    expect(editDistance("netflix", "netfllix")).toBe(1); // extra letter
    expect(editDistance("netflix", "netfrix")).toBe(1); // wrong letter
    expect(editDistance("netflix", "netlfix")).toBe(1); // swapped pair
    expect(editDistance("lunch", "brunch")).toBe(2);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("notesMatch", () => {
  it("matches equal, mostly-shared and typo'd notes", () => {
    expect(notesMatch("netflix", "netflix")).toBe(true);
    expect(notesMatch("netflix", "netflix sub")).toBe(true);
    expect(notesMatch("netflix family plan", "family plan on netflix")).toBe(true);
    expect(notesMatch("canva", "canva for family")).toBe(true); // 1 of 2
    expect(notesMatch("amazon prime", "amazon prime turkish")).toBe(true); // 2 of 3
    expect(notesMatch("netlfix", "netflix")).toBe(true);
    expect(notesMatch("netlfix sub", "netflix")).toBe(true); // typo in one word
    expect(notesMatch("gym pass", "gym pas")).toBe(true); // typo across the whole note
  });

  it("does not match on one word out of many", () => {
    expect(notesMatch("claude", "claude extra credits")).toBe(false); // 1 of 3
    expect(notesMatch("icloud for sara", "linkedin premium for sara")).toBe(false);
    expect(notesMatch("google workspace", "google ai studio balance")).toBe(false);
    expect(notesMatch("sillyguy com", "bucksbuddy com")).toBe(false);
  });

  it("does not match on a stopword alone, a different word, or a short fragment", () => {
    expect(notesMatch("netflix bill", "gym bill")).toBe(false);
    expect(notesMatch("claude subscription", "gym membership")).toBe(false);
    expect(notesMatch("lunch", "brunch")).toBe(false);
    expect(notesMatch("spotify", "shopify")).toBe(false);
    expect(notesMatch("ab", "abc")).toBe(false);
    expect(notesMatch("abc", "abd")).toBe(false); // too short to call a typo
  });

  it("treats empty notes as their own thing", () => {
    expect(notesMatch("", "")).toBe(true);
    expect(notesMatch("", "netflix")).toBe(false);
    expect(notesMatch("netflix", "")).toBe(false);
  });
});

describe("namesMatch", () => {
  const name = (raw: string) => noteName(raw);

  it("keeps a tagged note apart from the untagged one it would otherwise join", () => {
    // The whole point: half the words are shared, which is normally enough.
    expect(notesMatch("claude", "claude taktekbot")).toBe(true);
    expect(namesMatch(name("Claude subscription"), name("Claude (taktekbot) (monthly)"))).toBe(
      false,
    );
    expect(namesMatch(name("Claude (personal)"), name("Claude (taktekbot)"))).toBe(false);
    expect(namesMatch(name("Sara (1)"), name("Sara (2)"))).toBe(false);
  });

  it("still folds the same tag together, brackets or not, typos and all", () => {
    expect(namesMatch(name("Claude (taktekbot)"), name("claude (TaktekBot)"))).toBe(true);
    expect(namesMatch(name("Claude (taktekbot)"), name("Claude taktekbot"))).toBe(true);
    expect(namesMatch(name("Claude (taktekbot)"), name("Claude (taktekbo)"))).toBe(true);
    expect(namesMatch(name("Claude (taktekbot) sub"), name("Claude (taktekbot)"))).toBe(true);
  });

  it("leaves untagged notes to the word rules", () => {
    expect(namesMatch(name("Netflix"), name("netflix sub"))).toBe(true);
    expect(namesMatch(name("Canva"), name("Canva for family"))).toBe(true);
    expect(namesMatch(name("Claude"), name("Claude extra credits"))).toBe(false);
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

  it("offers the distinct past notes of the exact category, newest first", () => {
    expect(
      noteSuggestions(rows, { isIncome: false, category: "fees/subscriptions", query: "" }),
    ).toEqual(["Spotify", "Netflix"]);
    // A sibling subcategory keeps its own notes; the bare parent has none here.
    expect(
      noteSuggestions(rows, { isIncome: false, category: "fees/mobile", query: "" }),
    ).toEqual(["Mobile top-up"]);
    expect(noteSuggestions(rows, { isIncome: false, category: "fees", query: "" })).toEqual([]);
  });

  it("narrows to what's typed and drops an exact match", () => {
    const opts = { isIncome: false, category: "fees/subscriptions" };
    expect(noteSuggestions(rows, { ...opts, query: "net" })).toEqual(["Netflix"]);
    expect(noteSuggestions(rows, { ...opts, query: "NETFLIX" })).toEqual([]);
    expect(noteSuggestions(rows, { ...opts, query: "zzz" })).toEqual([]);
  });

  it("respects the limit", () => {
    expect(
      noteSuggestions(rows, { isIncome: false, category: "fees/subscriptions", query: "", limit: 1 }),
    ).toEqual(["Spotify"]);
  });
});
