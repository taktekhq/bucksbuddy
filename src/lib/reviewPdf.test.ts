import { describe, it, expect } from "vitest";
import { reviewToPdf, wrap } from "@/lib/reviewPdf";
import { buildDigest, type ReportWindow } from "@/lib/reportDigest";
import { detectRecurring } from "@/lib/recurring";
import type { SpendingReview, Transaction } from "@/types/db";

// Local noon throughout, so the local-calendar bucketing the digest does is
// deterministic wherever this runs.
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();
const NOW = new Date(2026, 8, 13, 12);
const WINDOW: ReportWindow = {
  id: "last_3_months",
  from: new Date(2026, 5, 1),
  to: NOW,
};

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 2500,
    original_currency: "USD",
    original_amount: 25,
    rate_used: 1,
    occurred_at: at(2026, 6, 4),
    note: null,
    created_at: at(2026, 6, 4),
    ...over,
  };
}

// June through mid-September: three categories, a salary, a Safe transfer and a
// subscription that repeats monthly under a note only this device can read.
const ROWS: Transaction[] = [
  ...[5, 6, 7].flatMap((month) =>
    [2, 9, 16, 23].map((day) =>
      tx({ category: "groceries", amount_usd_cents: 4200, occurred_at: at(2026, month, day) }),
    ),
  ),
  ...[5, 6, 7].flatMap((month) =>
    [3, 18].map((day) =>
      tx({ category: "food/delivery", amount_usd_cents: 3100, occurred_at: at(2026, month, day) }),
    ),
  ),
  ...[5, 6, 7, 8].map((month) =>
    tx({
      category: "fees/subscriptions",
      amount_usd_cents: 1599,
      occurred_at: at(2026, month, 1),
      note: "Netflix",
    }),
  ),
  ...[5, 6, 7].map((month) =>
    tx({
      category: "work",
      is_income: true,
      amount_usd_cents: 250000,
      occurred_at: at(2026, month, 28),
    }),
  ),
  tx({ category: "safe", amount_usd_cents: 40000, occurred_at: at(2026, 6, 29) }),
  tx({ category: "transport/taxi", amount_usd_cents: 90000, occurred_at: at(2026, 7, 11) }),
];

const digest = buildDigest(ROWS, WINDOW, "USD");
const recurring = detectRecurring(ROWS, "u1", NOW);

const review = (over: Partial<SpendingReview> = {}): SpendingReview =>
  ({
    version: 2,
    headline: "Steady, but delivery is climbing",
    standing: "steady",
    findings: [
      {
        kind: "good",
        basis: "logged",
        title: "You logged nearly every day",
        detail: "That is what makes the rest of this worth reading.",
        evidence: [{ label: "Days logged", value: "105" }],
        category: null,
      },
      {
        kind: "improve",
        basis: "followup",
        title: "Delivery is still the line to hold down",
        detail: "I said it last time and it has not moved.",
        evidence: [{ label: "Delivery", value: "$186.00" }],
        category: "Food · Delivery",
      },
      {
        kind: "swap",
        basis: "logged",
        title: "Something repeats in Fees",
        detail: "Go and find out what that is and be rid of it if you are not using it.",
        evidence: [{ label: "Each time", value: "$15.99" }],
        category: "Fees",
      },
    ],
    blindSpots: ["Cash you never logged is not here."],
    ...over,
  }) as SpendingReview;

const meta = {
  windowLabel: "Recent months · June 2026 – September 2026",
  currency: "USD" as const,
};

// toWinAnsi folds the app's own punctuation onto single bytes before the text
// is written, so reading the bytes back as characters is what a label actually
// looks like in the file: the middle dot is Latin-1's own 0xB7 and passes
// straight through, while an en dash becomes WinAnsi's 0x96.
const DOT = "\u00B7";
const DASH = "\u0096";

/** The bytes back as a string — one byte is one character, by construction. */
const asText = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join("");

const render = (...args: Parameters<typeof reviewToPdf>) => asText(reviewToPdf(...args));

describe("reviewToPdf — the file itself", () => {
  it("writes a structurally valid PDF", () => {
    const text = render(digest, review(), recurring, meta, NOW);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Encoding /WinAnsiEncoding");
  });

  it("points every cross-reference entry at its object", () => {
    // The xref table is the one part of a PDF a reader will not forgive, and it
    // is a list of exact byte offsets — so it is checked, not assumed.
    const text = render(digest, review(), recurring, meta, NOW);
    const start = Number(
      text.slice(text.lastIndexOf("startxref") + 9).trim().split("\n")[0],
    );
    expect(text.slice(start, start + 4)).toBe("xref");
    const header = /xref\n0 (\d+)\n/.exec(text.slice(start))!;
    const table = text.slice(start + header[0].length);
    for (let i = 1; i < Number(header[1]); i++) {
      const entry = table.slice(i * 20, (i + 1) * 20);
      expect(entry).toHaveLength(20);
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    }
  });

  it("declares every content stream's exact byte length", () => {
    const text = render(digest, review(), recurring, meta, NOW);
    const matches = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
    expect(matches.length).toBeGreaterThan(1);
    for (const match of matches) {
      const from = match.index! + match[0].length;
      expect(text.slice(from + Number(match[1]), from + Number(match[1]) + 10)).toBe(
        "\nendstream",
      );
    }
  });

  it("numbers every page, and runs to more than one", () => {
    const text = render(digest, review(), recurring, meta, NOW);
    const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)![1]);
    expect(pages).toBeGreaterThan(1);
    for (let i = 1; i <= pages; i++) {
      expect(text).toContain(`(Page ${i} of ${pages})`);
    }
  });
});

describe("reviewToPdf — what it carries", () => {
  const text = render(digest, review(), recurring, meta, NOW);

  it("mastheads with the window it covers and the day it was taken", () => {
    expect(text).toContain("(BucksBuddy)");
    expect(text).toContain(`(Recent months ${DOT} June 2026 ${DASH} September 2026)`);
    expect(text).toContain("(Taken 13 Sep 2026");
  });

  it("prints the totals the device computed, as the app would print them", () => {
    expect(text).toContain(`(${digest.totals.spent.display})`);
    expect(text).toContain(`(${digest.totals.income.display})`);
    expect(text).toContain(`(${digest.totals.dailyAverage.display})`);
  });

  it("charts the months, and says how much of each is inside the window", () => {
    expect(text).toContain("(MONTH BY MONTH)");
    expect(text).toContain("(June 2026)");
    // September is cut off by the window's end, so its row must not read as a
    // finished month set beside three that are.
    expect(text).toMatch(/\(\d+ days in window\)/);
  });

  it("charts where the money went, biggest first", () => {
    expect(text).toContain("(WHERE IT WENT)");
    expect(text).toContain("(Groceries)");
    const groceries = text.indexOf("(Groceries)");
    const delivery = text.indexOf(`(Food ${DOT} Delivery)`);
    expect(groceries).toBeGreaterThan(-1);
    if (delivery > -1) expect(groceries).toBeLessThan(delivery);
  });

  it("names the repeating charges, which is the thing Dad never could", () => {
    // Notes never leave the device, so no model has ever seen this word. It is
    // on the page because the device read it off the reader's own entry.
    expect(text).toContain("(WHAT REPEATS)");
    expect(text).toContain("(Netflix)");
    expect(text).toContain(`(Monthly ${DOT} Fees)`);
  });

  it("carries Dad's verdict, his findings and his blind spots", () => {
    expect(text).toContain("(WHAT DAD SAID)");
    expect(text).toContain("(Steady, but delivery is climbing)");
    expect(text).toContain("(STEADY)");
    expect(text).toContain("(You logged nearly every day)");
    expect(text).toContain("(WHAT THIS REVIEW COULD NOT SEE)");
    expect(text).toContain("Cash you never logged is not here.");
  });

  it("marks each finding's kind in words, never by colour alone", () => {
    // The document has to read correctly in greyscale, which is how a lot of
    // paper comes out.
    expect(text).toContain("(DOING RIGHT)");
    expect(text).toContain("(COULD COST LESS)");
  });

  it("marks a finding that revisits what Dad said last time", () => {
    expect(text).toContain(`(KEEP AN EYE ON THIS ${DOT} SINCE LAST TIME)`);
  });

  it("answers Dad's errand with the note the reader typed", () => {
    expect(text).toContain(`(Your note says Netflix ${DOT} Monthly)`);
  });

  it("says what this is and is not, on the page that can be forwarded", () => {
    expect(text).toContain("Not financial advice.");
  });
});

describe("reviewToPdf — what it does without", () => {
  it("prints the figures alone when no review has been written yet", () => {
    const text = render(digest, null, recurring, meta, NOW);
    expect(text).toContain("(WHERE IT WENT)");
    expect(text).not.toContain("(WHAT DAD SAID)");
    // A different closing line, because there is no Dad on this one to explain.
    expect(text).toContain("Figures from what you logged");
  });

  it("leaves out what repeats while the device is locked", () => {
    // Every amount in a masked summary is zero, so the section would be a page
    // of "$0.00" presented as this reader's subscriptions.
    const text = render(digest, review(), { ...recurring, anyMasked: true }, meta, NOW);
    expect(text).not.toContain("(WHAT REPEATS)");
    expect(text).not.toContain("(Netflix)");
  });

  it("leaves out what repeats when nothing does", () => {
    const text = render(digest, review(), null, meta, NOW);
    expect(text).not.toContain("(WHAT REPEATS)");
  });

  it("still prints a review written in the superseded prose shape", () => {
    // A review bought before the redesign is the reader's, and it exports as it
    // was written rather than being refused.
    const prose = {
      version: 1,
      title: "Three months of takeaway",
      summary: "Spending held steady; food is the story.",
      sections: [{ heading: "Where it went", body: "Food led every month.", figures: [] }],
      notables: [],
      caveats: [],
    } as SpendingReview;
    const text = render(digest, prose, recurring, meta, NOW);
    expect(text).toContain("(YOUR REVIEW)");
    expect(text).toContain("(Three months of takeaway)");
    expect(text).not.toContain("(WHAT DAD SAID)");
  });

  it("writes a usable page for an account with almost nothing in it", () => {
    // The breakdown is on screen from the first entry, long before the forty
    // that a review needs, so the export has to survive an empty-ish digest.
    const thin = buildDigest([tx()], WINDOW, "USD");
    const text = render(thin, null, null, meta, NOW);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("(Page 1 of 1)");
  });

  it("survives a digest with nothing logged at all", () => {
    const empty = buildDigest([], WINDOW, "USD");
    const text = render(empty, null, null, meta, NOW);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("renders a finding kind it has never met rather than dropping it", () => {
    const text = render(
      digest,
      review({
        findings: [
          {
            kind: "goal",
            basis: "logged",
            title: "Ahead of target",
            detail: "From a newer server.",
            evidence: [],
            category: null,
          },
        ],
      } as Partial<SpendingReview>),
      recurring,
      meta,
      NOW,
    );
    expect(text).toContain("(Ahead of target)");
    expect(text).toContain("(FINDING)");
  });
});

describe("wrap", () => {
  it("breaks at spaces, filling each line", () => {
    const lines = wrap("the quick brown fox jumped over it", 60, 9);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("the quick brown fox jumped over it");
  });

  it("leaves a string that fits on one line", () => {
    expect(wrap("short", 200, 9)).toEqual(["short"]);
  });

  it("truncates a single word too long for the line", () => {
    // A hyphen invented mid-word reads as part of the word, so it is cut with
    // an ellipsis instead.
    const [only] = wrap("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 30, 9);
    expect(only.endsWith("...")).toBe(true);
  });

  it("is empty for an empty string", () => {
    expect(wrap("   ", 100, 9)).toEqual([]);
  });
});
