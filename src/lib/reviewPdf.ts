// The spending review as a document you can keep.
//
// Everything a review is made of already exists on the device — the digest was
// totalled here (lib/reportDigest), the charts are drawn from it, the
// subscriptions were read out of notes that never left the phone
// (lib/recurring), and Dad's findings came back and were sealed with the
// account's own key. What none of it could do was LEAVE the screen. A review
// was a page you read once and slid into an archive, which is a strange thing
// to ask anyone to value: nothing to keep, nothing to send, nothing to put in
// front of someone else.
//
// So this prints the whole thing — the figures and the judgement, in the order
// the screen shows them — as a file. Built entirely on this device, from bytes
// this device already holds: nothing is uploaded to make it, and it works with
// no network at all.
//
// WHY IT LOOKS NOTHING LIKE THE SCREEN. The review room is a dark blue room,
// and its chart ramp (lib/reviewChart) was chosen against `review-card` at
// #10314A — the palest slot in it is #BBDCF5, which is very nearly white and
// would vanish on paper. Contrast ratios do not survive an inversion, so the
// ramp is not reused here; this document has its own ink, chosen against white,
// and keeps the rule that matters: HUE IS NEVER THE ONLY CARRIER. Every bar on
// every chart below prints its label and its value as text beside it, so the
// whole document reads correctly in greyscale, which is how a lot of paper
// actually comes out.

import {
  BOTTOM,
  CARROT,
  CONTENT_W,
  EXPENSE,
  HAIRLINE,
  INCOME,
  LABEL,
  MARGIN,
  MUTED,
  PAGE_H,
  PAGE_W,
  line,
  pdfDate,
  rect,
  serialize,
  symbolStyle,
  text,
  textRight,
  textWidth,
  truncateToWidth,
  type Ops,
} from "@/lib/pdfKit";
import { CADENCE_LABEL, type RecurringSummary } from "@/lib/recurring";
import { categoryLabel, splitCategory } from "@/lib/categories";
import { formatCents } from "@/lib/money";
import { namedCharge } from "@/lib/reviewNaming";
import type { Currency } from "@/lib/currency";
import type { SpendingDigest } from "@/lib/reportDigest";
import type { ReviewFinding, SpendingReview } from "@/types/db";

// --- ink, chosen against white ---

/** The bar ink. One hue: the rows are ranked and labelled, so five would only
 *  be decoration, and decoration is what fails first in greyscale. */
const BAR = "0.176 0.404 0.596";
/** The same bar, for the part of a pair that is the smaller/older side. */
const BAR_FADED = "0.722 0.804 0.867";
/** A tile's backing wash — lighter than the hairline so type sits on top. */
const WASH = "0.957 0.969 0.976";

// What each kind of finding is marked with. The WORDS carry it; the square is
// decoration, and is why none of these needs to be distinguishable from the
// others to be read. Green and red are deliberately absent — they mean money in
// and money out everywhere else in this app (docs/DESIGN_SYSTEM.md), and a
// green tick beside a sentence about spending reads as a credit.
const KINDS: Record<string, { label: string; color: string }> = {
  good: { label: "Doing right", color: "0.106 0.435 0.541" },
  improve: { label: "Keep an eye on this", color: "0.647 0.478 0.086" },
  swap: { label: "Could cost less", color: "0.180 0.400 0.690" },
};
const UNKNOWN_KIND = { label: "Finding", color: MUTED };

/** The same order the screen reads them in, and the same reason. */
const KIND_ORDER = ["good", "improve", "swap"];

const STANDINGS: Record<string, string> = {
  improving: "Improving",
  steady: "Steady",
  slipping: "Slipping",
  unclear: "Not enough to say",
};

// --- type sizes ---

const H1 = 20;
const H2 = 12;
const BODY = 9.5;
const SMALL = 8;
const CAPTION = 7.5;

/** How many rows a charted list prints before it stops being a summary. */
const TOP_ROWS = 8;

// --- a document that flows across pages ---
//
// Every section is written by drawing from `y` downwards and asking for the
// room it needs first. A section that will not fit starts a page instead of
// running off the bottom, which is the one thing a hand-rolled writer will
// happily do if nobody checks.
type Flow = { pages: Ops[]; ops: Ops; y: number };

function newFlow(): Flow {
  return { pages: [], ops: [], y: PAGE_H - MARGIN - 18 };
}

/** Start a fresh page unless `height` points are still free below the cursor. */
function need(flow: Flow, height: number): void {
  if (flow.y - height >= BOTTOM) return;
  flow.pages.push(flow.ops);
  flow.ops = [];
  flow.y = PAGE_H - MARGIN - 18;
}

/**
 * Break `s` into lines that each fit `width`.
 *
 * A word longer than the whole line is cut with an ellipsis rather than
 * hyphenated — this only happens to a pasted URL or a very long merchant name,
 * and a wrong hyphen reads as part of the word.
 */
export function wrap(
  s: string,
  width: number,
  size: number,
  bold = false,
): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of s.split(/\s+/).filter((w) => w !== "")) {
    const next = current === "" ? word : `${current} ${word}`;
    if (textWidth(next, size, bold) <= width) {
      current = next;
      continue;
    }
    if (current !== "") out.push(current);
    current = textWidth(word, size, bold) <= width
      ? word
      : truncateToWidth(word, width, size, bold);
  }
  if (current !== "") out.push(current);
  return out;
}

/** Draw wrapped text from the cursor down, paging as it goes. */
function paragraph(
  flow: Flow,
  s: string,
  size: number,
  color: string,
  { bold = false, width = CONTENT_W, indent = 0, leading = size + 3.5 } = {},
): void {
  for (const lineText of wrap(s, width, size, bold)) {
    need(flow, leading);
    text(flow.ops, lineText, MARGIN + indent, flow.y, size, color, bold);
    flow.y -= leading;
  }
}

/**
 * A section's rule and name — the print form of the screen's SectionHeader.
 *
 * It asks for more room than it occupies on purpose: a heading that just fits
 * at the foot of a page strands its own contents overleaf, which reads as two
 * broken sections rather than one that turned the page.
 */
function heading(flow: Flow, name: string): void {
  need(flow, 58);
  flow.y -= 8;
  line(flow.ops, MARGIN, flow.y + 11, PAGE_W - MARGIN, HAIRLINE);
  text(flow.ops, name.toUpperCase(), MARGIN, flow.y, SMALL, MUTED, true);
  flow.y -= 16;
}

// --- charts ---

// One charted row: what it is on the left, how big it is in the middle, what it
// came to on the right. The bar is scaled against the largest value in its own
// list, never against the window's total, so a list of small categories still
// has a full-length bar at the top of it and stays readable.
const ROW_LABEL_W = 132;
const ROW_VALUE_W = 104;
const ROW_BAR_W = CONTENT_W - ROW_LABEL_W - ROW_VALUE_W - 16;
const ROW_H = 15;

type BarRow = {
  label: string;
  value: string;
  /** 0–1 of the row with the longest bar. */
  fraction: number;
  /** A second, lighter bar behind it — the "before" of a pair. */
  behind?: number;
  /** A small note under the value, e.g. a share or a count. */
  note?: string;
};

function barRows(flow: Flow, rows: BarRow[]): void {
  for (const row of rows) {
    need(flow, ROW_H + 4);
    const y = flow.y;
    text(
      flow.ops,
      truncateToWidth(row.label, ROW_LABEL_W - 6, BODY),
      MARGIN,
      y,
      BODY,
      LABEL,
    );

    const barX = MARGIN + ROW_LABEL_W;
    // The track, so a short bar still reads as a short bar rather than as a
    // missing one.
    rect(flow.ops, barX, y - 1.5, ROW_BAR_W, 7, WASH);
    if (row.behind !== undefined && row.behind > 0) {
      rect(flow.ops, barX, y - 1.5, ROW_BAR_W * row.behind, 7, BAR_FADED);
    }
    if (row.fraction > 0) {
      // A floor of a point and a half: a category that is a rounding error of
      // the biggest one still has to be visible, or the row looks like a bug.
      const w = Math.max(1.5, ROW_BAR_W * row.fraction);
      rect(flow.ops, barX, y - 1.5, w, 7, BAR);
    }

    textRight(flow.ops, row.value, PAGE_W - MARGIN, y, BODY, LABEL, true);
    if (row.note !== undefined) {
      textRight(flow.ops, row.note, PAGE_W - MARGIN, y - 8, CAPTION, MUTED);
      flow.y -= 8;
    }
    flow.y -= ROW_H;
  }
}

/** Scale a list of cent figures to 0–1 of its own largest. */
function scaled(values: number[]): (cents: number) => number {
  const top = Math.max(0, ...values);
  return (cents: number) => (top === 0 ? 0 : Math.max(0, cents) / top);
}

// --- the document ---

export type ReviewPdfMeta = {
  /** "Recent months · June 2026 – September 2026". */
  windowLabel: string;
  currency: Currency;
};

/** The masthead: what this is, what it covers, and when it was taken. */
function masthead(flow: Flow, meta: ReviewPdfMeta, digest: SpendingDigest, now: Date): void {
  text(flow.ops, "BucksBuddy", MARGIN, flow.y, H1, CARROT, true);
  flow.y -= 20;
  text(flow.ops, "Spending review", MARGIN, flow.y, H2, LABEL, true);
  flow.y -= 15;
  text(flow.ops, meta.windowLabel, MARGIN, flow.y, BODY, LABEL);
  flow.y -= 12;
  // Both windows end when they were asked for, so a review is a snapshot and
  // the date it was taken is part of reading it.
  text(
    flow.ops,
    `Taken ${pdfDate(now.toISOString())} · ${digest.period.days} days · ${digest.totals.spendCount} expenses`,
    MARGIN,
    flow.y,
    SMALL,
    MUTED,
  );
  flow.y -= 14;
  line(flow.ops, MARGIN, flow.y, PAGE_W - MARGIN, CARROT, 1.5);
  flow.y -= 22;
}

/** The three figures the whole document hangs off, across the page. */
function totalsBand(flow: Flow, digest: SpendingDigest): void {
  need(flow, 44);
  const band: [string, string, string][] = [
    ["Spent", digest.totals.spent.display, EXPENSE],
    ["Logged in", digest.totals.income.display, INCOME],
    ["Net", digest.totals.net.display, LABEL],
  ];
  let x = MARGIN;
  for (const [label, value, color] of band) {
    text(flow.ops, label.toUpperCase(), x, flow.y, CAPTION, MUTED, true);
    text(flow.ops, value, x, flow.y - 16, 15, color, true);
    x += 150;
  }
  flow.y -= 30;

  // The second rank: the rates and the coverage, which is what says how much
  // the figures above are worth.
  need(flow, 24);
  const second = [
    ["A day", digest.totals.dailyAverage.display],
    ["A logged day", digest.totals.perLoggedDayAverage.display],
    ["Typical expense", digest.totals.medianExpense.display],
    ["Days logged", `${digest.coverage.daysLogged} of ${digest.coverage.days}`],
  ];
  x = MARGIN;
  for (const [label, value] of second) {
    text(flow.ops, label, x, flow.y, CAPTION, MUTED);
    text(flow.ops, value, x, flow.y - 11, BODY, LABEL, true);
    x += 128;
  }
  flow.y -= 26;
}

function months(flow: Flow, digest: SpendingDigest): void {
  if (digest.months.length === 0) return;
  heading(flow, "Month by month");
  const fraction = scaled(digest.months.map((m) => m.spent.cents));
  barRows(
    flow,
    digest.months.map((m) => ({
      label: m.label,
      value: m.spent.display,
      fraction: fraction(m.spent.cents),
      // A window can end mid-month, so a month's total is only comparable to
      // another's once you know how much of it is inside the window. The screen
      // says this too; on paper, where nobody can tap anything, it has to.
      note:
        m.days === daysInMonth(m.key)
          ? `${m.daysLogged} days logged`
          : `${m.days} days in window`,
    })),
  );
}

/** Days in the calendar month a "YYYY-MM" key names. */
function daysInMonth(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function categories(flow: Flow, digest: SpendingDigest): void {
  if (digest.categories.length === 0) return;
  heading(flow, "Where it went");
  const top = digest.categories.slice(0, TOP_ROWS);
  const fraction = scaled(top.map((c) => c.spent.cents));
  barRows(
    flow,
    top.map((c) => ({
      label: c.label,
      value: c.spent.display,
      fraction: fraction(c.spent.cents),
      note: `${c.sharePct}% · ${c.count} entries`,
    })),
  );
  // The digest carries only the top ten, so a line missing from this list is
  // not a line that is zero — the same warning the model is given.
  if (digest.categories.length > TOP_ROWS) {
    paragraph(
      flow,
      `Showing the ${TOP_ROWS} largest. Smaller categories are not listed.`,
      CAPTION,
      MUTED,
    );
  }
}

function movers(flow: Flow, digest: SpendingDigest): void {
  const moved = digest.monthOverMonth.filter((c) => c.direction !== "flat").slice(0, 6);
  if (moved.length === 0) return;
  // Every entry names the same two months — they are a property of the window,
  // not of the category — so the first of them speaks for the section.
  const { firstMonth, lastMonth } = moved[0];
  heading(flow, "What moved");
  // Whole months only, and named rather than implied: these two are not
  // necessarily the window's own ends, and a month still running is not in this
  // comparison at all (see DigestChange).
  paragraph(flow, `${firstMonth} against ${lastMonth}, on each month's total.`, CAPTION, MUTED);

  const fraction = scaled(moved.flatMap((c) => [c.first.cents, c.last.cents]));
  barRows(
    flow,
    moved.map((c) => ({
      label: c.category,
      value: c.last.display,
      fraction: fraction(c.last.cents),
      behind: fraction(c.first.cents),
      note:
        c.direction === "new"
          ? `new · was ${c.first.display}`
          : `${c.direction === "up" ? "up" : "down"} ${Math.abs(c.changePct ?? 0)}% · was ${c.first.display}`,
    })),
  );
}

function saving(flow: Flow, digest: SpendingDigest): void {
  const { intoSafe, outOfSafe, netIntoSafe, savedSharePct, leftOverSharePct } =
    digest.saving;
  if (intoSafe.cents === 0 && outOfSafe.cents === 0) return;
  heading(flow, "What reached the Safe");
  need(flow, 30);
  let x = MARGIN;
  for (const [label, value] of [
    ["Put away", intoSafe.display],
    ["Taken back out", outOfSafe.display],
    ["Net", netIntoSafe.display],
  ]) {
    text(flow.ops, label, x, flow.y, CAPTION, MUTED);
    text(flow.ops, value, x, flow.y - 12, 11, LABEL, true);
    x += 150;
  }
  flow.y -= 26;
  // Both shares are null without logged income, and a null share is not zero —
  // it is a share of a denominator that does not exist. Saying nothing is the
  // only honest option.
  if (savedSharePct !== null && leftOverSharePct !== null) {
    paragraph(
      flow,
      `${leftOverSharePct}% of what you logged coming in went unspent; ${savedSharePct}% of it reached the Safe.`,
      SMALL,
      MUTED,
    );
  }
}

// The one section a model could never write, and the reason this document is
// worth more than the screen's text alone: these are NAMED. Recurring payments
// are found on the device from the note the reader typed (lib/recurring), and
// note text has never left the phone — it is not in the digest and never will
// be. So the app prints "Netflix · Monthly · $15.99" on a page Dad could only
// have called "a charge that repeats in Fees".
function fixedCosts(
  flow: Flow,
  recurring: RecurringSummary | null,
  currency: Currency,
): void {
  if (recurring === null || recurring.anyMasked) return;
  const out = recurring.payments.filter((p) => !p.isIncome);
  if (out.length === 0) return;

  heading(flow, "What repeats");
  const style = symbolStyle(currency);
  paragraph(
    flow,
    `About ${formatCents(recurring.monthlyOutCents, currency, style)} a month, from what you have logged so far.`,
    CAPTION,
    MUTED,
  );
  flow.y -= 4;

  for (const payment of out.slice(0, TOP_ROWS)) {
    need(flow, 17);
    const name = payment.note ?? categoryLabel(splitCategory(payment.category).base);
    text(
      flow.ops,
      truncateToWidth(name, 300, BODY, true),
      MARGIN,
      flow.y,
      BODY,
      LABEL,
      true,
    );
    text(
      flow.ops,
      `${CADENCE_LABEL[payment.cadence]} · ${categoryLabel(splitCategory(payment.category).base)}`,
      MARGIN + 310,
      flow.y,
      SMALL,
      MUTED,
    );
    textRight(
      flow.ops,
      formatCents(payment.amountCents, currency, style),
      PAGE_W - MARGIN,
      flow.y,
      BODY,
      LABEL,
      true,
    );
    flow.y -= 17;
  }
}

function biggest(flow: Flow, digest: SpendingDigest): void {
  if (digest.largestExpenses.length === 0) return;
  heading(flow, "The biggest single expenses");
  for (const entry of digest.largestExpenses) {
    need(flow, 15);
    text(flow.ops, entry.category, MARGIN, flow.y, BODY, LABEL);
    // Entries are stamped when they were LOGGED — there is no date picker — so
    // this is a logging date and the caption says so rather than implying the
    // money moved that day.
    text(flow.ops, `logged ${pdfDate(entry.date)}`, MARGIN + 200, flow.y, SMALL, MUTED);
    textRight(flow.ops, entry.amount.display, PAGE_W - MARGIN, flow.y, BODY, LABEL, true);
    flow.y -= 15;
  }
}

/** Dad's findings, in the order the screen reads them. */
function whatDadSaid(
  flow: Flow,
  review: SpendingReview,
  digest: SpendingDigest,
  recurring: RecurringSummary | null,
  currency: Currency,
): void {
  if (review.version !== 2) {
    // The superseded prose shape. It is the reader's and it prints, but it has
    // no findings to lay out, so it goes down as what it is: paragraphs.
    heading(flow, "Your review");
    paragraph(flow, review.title, H2, LABEL, { bold: true, leading: 16 });
    paragraph(flow, review.summary, BODY, LABEL);
    for (const section of review.sections) {
      flow.y -= 6;
      paragraph(flow, section.heading, BODY, LABEL, { bold: true });
      paragraph(flow, section.body.replace(/\s+/g, " "), BODY, MUTED);
    }
    return;
  }

  heading(flow, "What Dad said");
  need(flow, 44);
  paragraph(flow, review.headline, H2, LABEL, { bold: true, leading: 16 });
  text(
    flow.ops,
    (STANDINGS[review.standing] ?? review.standing).toUpperCase(),
    MARGIN,
    flow.y,
    CAPTION,
    MUTED,
    true,
  );
  flow.y -= 18;

  const rank = (kind: string) => {
    const i = KIND_ORDER.indexOf(kind);
    return i === -1 ? KIND_ORDER.length : i;
  };
  const sorted = [...review.findings].sort((a, b) => rank(a.kind) - rank(b.kind));
  for (const finding of sorted) {
    drawFinding(flow, finding, digest, recurring, currency);
  }

  if (review.blindSpots.length > 0) {
    flow.y -= 4;
    heading(flow, "What this review could not see");
    for (const spot of review.blindSpots) {
      paragraph(flow, `\u2022  ${spot}`, SMALL, MUTED);
    }
  }
}

function drawFinding(
  flow: Flow,
  finding: ReviewFinding,
  digest: SpendingDigest,
  recurring: RecurringSummary | null,
  currency: Currency,
): void {
  const mark = KINDS[finding.kind] ?? UNKNOWN_KIND;
  // Keep the mark, the caption and the first line of the claim together: a
  // finding split immediately under its own heading reads as two fragments.
  need(flow, 40);
  flow.y -= 6;

  rect(flow.ops, MARGIN, flow.y - 0.5, 6, 6, mark.color);
  let caption = mark.label.toUpperCase();
  // Dad revisiting his own word from the window before this one. The server
  // only lets a finding claim this when a previous review was actually sent
  // with the request, so it can never appear on a first review.
  if (finding.basis === "followup") caption += " · SINCE LAST TIME";
  text(flow.ops, caption, MARGIN + 11, flow.y, CAPTION, MUTED, true);
  flow.y -= 13;

  paragraph(flow, finding.title, 10.5, LABEL, { bold: true, leading: 13.5 });
  paragraph(flow, finding.detail, BODY, MUTED, { leading: 12.5 });

  // The app answering the errand Dad just set: he was never told what the
  // charge is, and the note that says so is on this device (lib/reviewNaming).
  const named = namedCharge(finding, digest, recurring, currency);
  if (named !== null) {
    paragraph(
      flow,
      `Your note says ${named.note} · ${CADENCE_LABEL[named.cadence]}`,
      SMALL,
      BAR,
    );
  }

  if (finding.evidence.length > 0) {
    need(flow, 16);
    flow.y -= 2;
    let x = MARGIN;
    for (const figure of finding.evidence) {
      // Every one of these was checked character-for-character against the
      // digest before the review was accepted; they are the only strings in a
      // review allowed to contain a digit at all.
      text(flow.ops, figure.label, x, flow.y, CAPTION, MUTED);
      text(flow.ops, figure.value, x, flow.y - 10, BODY, LABEL, true);
      x += Math.max(
        108,
        textWidth(figure.value, BODY, true) + 24,
        textWidth(figure.label, CAPTION) + 24,
      );
    }
    flow.y -= 16;
  }
  // The white between findings is what makes them separate cards on paper.
  flow.y -= 8;
}

/**
 * The review as PDF bytes: the figures this device computed, then what Dad made
 * of them. `review` may be null — the breakdown is worth keeping on its own,
 * and it is what the screen shows before a review has ever been written.
 */
export function reviewToPdf(
  digest: SpendingDigest,
  review: SpendingReview | null,
  recurring: RecurringSummary | null,
  meta: ReviewPdfMeta,
  now = new Date(),
): Uint8Array<ArrayBuffer> {
  const flow = newFlow();

  masthead(flow, meta, digest, now);
  totalsBand(flow, digest);
  months(flow, digest);
  categories(flow, digest);
  movers(flow, digest);
  saving(flow, digest);
  fixedCosts(flow, recurring, meta.currency);
  biggest(flow, digest);
  if (review !== null) {
    whatDadSaid(flow, review, digest, recurring, meta.currency);
  }

  // The same line the screen carries under every review, for the same reason:
  // Dad is a voice, and a voice is exactly the thing that should not be read as
  // advice. On a page that can be forwarded to someone who never saw the app,
  // it matters more, not less.
  flow.y -= 8;
  need(flow, 24);
  line(flow.ops, MARGIN, flow.y + 8, PAGE_W - MARGIN, HAIRLINE);
  paragraph(
    flow,
    review === null
      ? "Figures from what you logged in BucksBuddy. Not financial advice."
      : "Dad only sees what you logged. Every figure here was worked out on your own device. Not financial advice.",
    CAPTION,
    MUTED,
  );
  flow.pages.push(flow.ops);

  // Footers last: "Page 1 of 3" needs the count, which only exists now.
  flow.pages.forEach((page, i) => {
    const label = `Page ${i + 1} of ${flow.pages.length}`;
    text(page, label, (PAGE_W - textWidth(label, SMALL)) / 2, MARGIN - 12, SMALL, MUTED);
  });

  return serialize(flow.pages, `BucksBuddy review — ${meta.windowLabel}`, now);
}
