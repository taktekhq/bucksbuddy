import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { monthFacts } from "@/lib/recap";
import { FONT_FAMILY } from "@/lib/recapText";
import type { RecapTitle } from "@/lib/recapTitles";
import { buildRecapView, type RecapChoices, type RecapView } from "@/lib/recapView";
import { RecapCard, CARD_WIDTH, CARD_HEIGHT } from "@/components/recap/RecapCard";
import type { Transaction } from "@/types/db";

// Fixtures go through the local-time Date constructor (noon unless the test
// is about the hour) so day and hour bucketing is deterministic in any
// timezone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

// June 2026: a past month with 30 days whose 1st is a Monday, so its weekends
// are 6/7, 13/14, 20/21 and 27/28. September 2026 is the month `NOW` is in.
const JUN = "2026-06";
const SEP = "2026-09";
const NOW = new Date(2026, 8, 13, 12);

const TITLE: RecapTitle = {
  id: "thats_all_forks",
  title: "THAT'S ALL, FORKS.",
  caption: "Fork it over, Doc. Every plate got logged.",
  tier: "everyday",
};

// monthFacts de-duplicates rows by id, so every fixture row gets its own.
let seq = 0;
function tx(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1000,
    original_currency: "USD",
    original_amount: 10,
    rate_used: 1,
    occurred_at: at(2026, 5, 1),
    note: null,
    created_at: at(2026, 5, 1),
    ...overrides,
  };
}

// One groceries row on each of the given June days, at the given hour.
function onDays(days: number[], hour = 12, overrides: Partial<Transaction> = {}): Transaction[] {
  return days.map((d) => tx({ occurred_at: at(2026, 5, d, hour), ...overrides }));
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Four categories on five weekdays: Food leads (46%), then Groceries and
// Coffee, with Gas left over for "Everything else". Five days is Common.
const TYPICAL: Transaction[] = [
  tx({ category: "food", amount_usd_cents: 1500, occurred_at: at(2026, 5, 1) }),
  tx({ category: "food", amount_usd_cents: 1500, occurred_at: at(2026, 5, 2) }),
  tx({ category: "groceries", amount_usd_cents: 2000, occurred_at: at(2026, 5, 3) }),
  tx({ category: "coffee", amount_usd_cents: 1000, occurred_at: at(2026, 5, 4) }),
  tx({ category: "gas", amount_usd_cents: 500, occurred_at: at(2026, 5, 5) }),
];

function viewOf(
  rows: Transaction[],
  choices: Partial<RecapChoices> = {},
  key = JUN,
  now = NOW,
): RecapView {
  return buildRecapView(monthFacts(rows, key, now), {
    title: TITLE,
    stamps: [],
    showCaption: true,
    showAmounts: true,
    name: "",
    currency: "USD",
    ...choices,
  });
}

function renderCard(view: RecapView) {
  const { container } = render(<RecapCard view={view} />);
  const texts = () => [...container.querySelectorAll("text")].map((t) => t.textContent);
  // The title is the Grobold text that isn't the wordmark, joined across lines.
  const titleLines = () =>
    [...container.querySelectorAll("text")]
      .filter((t) => t.getAttribute("font-family") === FONT_FAMILY.grobold)
      .map((t) => t.textContent!)
      .filter((s) => s !== "BUCKS" && s !== "BUDDY");
  return { container, texts, titleLines };
}

describe("RecapCard", () => {
  it("is one 5:7 SVG named by its title, rarity and edition, and forwards its ref", () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(<RecapCard ref={ref} view={viewOf(TYPICAL)} />);
    const svg = screen.getByRole("img", { name: "THAT'S ALL, FORKS. Common card for JUN 2026" });
    expect(svg).toHaveAttribute("viewBox", `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`);
    expect(ref.current).toBe(svg);
    expect(container.firstChild).toBe(svg);
  });

  it("shows the title, the days logged, the type chip and the edition", () => {
    const { texts, titleLines } = renderCard(viewOf(TYPICAL));
    expect(titleLines().join(" ")).toBe("THAT'S ALL, FORKS.");
    expect(texts()).toContain("5/30");
    expect(texts()).toContain("DAYS LOGGED");
    expect(texts()).toContain("TYPE · FOOD");
    expect(texts()).toContain("JUN 2026");
    expect(texts()).toContain("bucksbuddy.com");
    // The hero number is the lead's share, drawn twice (shadow and face).
    expect(texts().filter((s) => s === "46%")).toHaveLength(2);
    expect(texts()).toContain("OF LOGGED");
    expect(texts()).toContain("SPENDING");
  });

  it("wraps a long title over two lines", () => {
    const long = { ...TITLE, title: "THE LONGEST TITLE IN THE WHOLE BINDER." };
    const { titleLines } = renderCard(viewOf(TYPICAL, { title: long }));
    expect(titleLines()).toHaveLength(2);
    expect(titleLines().join(" ")).toBe("THE LONGEST TITLE IN THE WHOLE BINDER.");
  });

  it("lists the top categories with nickname, entries and amount, and their percents", () => {
    const { texts, container } = renderCard(viewOf(TYPICAL));
    const t = texts();
    expect(t).toContain("Food");
    expect(t).toContain("Fork lift · 2 entries · $30.00");
    expect(t).toContain("Groceries");
    expect(t).toContain("Cart charge · 1 entry · $20.00");
    expect(t).toContain("Coffee");
    expect(t).toContain("Espresso shot · 1 entry · $10.00");
    // "Everything else" never gets a row on the card — only the top three do.
    expect(t).not.toContain("Everything else");
    expect(t).not.toContain("Gas");
    expect(t).toContain("46");
    expect(t).toContain("31");
    expect(t).toContain("15");
    expect(t.filter((s) => s === "%")).toHaveLength(3);
    // Rows after the first are separated by a hairline.
    expect(container.querySelectorAll('line[stroke-width="1.5"]').length).toBeGreaterThan(0);
  });

  it("leaves amounts off the rows and drops the TOTAL OUT tile when they are hidden", () => {
    const { texts } = renderCard(viewOf(TYPICAL, { showAmounts: false }));
    const t = texts();
    expect(t).toContain("Fork lift · 2 entries");
    expect(t).not.toContain("Fork lift · 2 entries · $30.00");
    expect(t).not.toContain("TOTAL OUT");
    expect(t).not.toContain("$65.00");
    expect(t).toContain("ENTRIES");
  });

  it("adds the month's total as a fifth tile when amounts are on", () => {
    const { texts } = renderCard(viewOf(TYPICAL));
    expect(texts()).toContain("TOTAL OUT");
    expect(texts()).toContain("$65.00");
  });

  it("shows the streak, the spectrum with one lit slot per category, and the entry count", () => {
    const { texts, container } = renderCard(viewOf(TYPICAL));
    const t = texts();
    expect(t).toContain("DAY STREAK");
    expect(t).toContain("5");
    expect(t).toContain("SPECTRUM");
    expect(t).toContain(`4/${EXPENSE_CATEGORIES.length}`);
    expect(EXPENSE_CATEGORIES).toHaveLength(18);
    const slots = container.querySelectorAll('rect[width="8"][height="6"]');
    expect(slots).toHaveLength(18);
    expect([...slots].filter((r) => r.getAttribute("opacity") === "1")).toHaveLength(4);
    expect([...slots].filter((r) => r.getAttribute("opacity") === "0.15")).toHaveLength(14);
  });

  it("draws a single-category month as one row with the whole spectrum but one slot dark", () => {
    const { texts, container } = renderCard(viewOf(onDays([1, 2, 3])));
    const t = texts();
    expect(t).toContain("Groceries");
    expect(t).toContain("Cart charge · 3 entries · $30.00");
    expect(t.filter((s) => s === "%")).toHaveLength(1);
    expect(t.filter((s) => s === "100%")).toHaveLength(2);
    expect(t).toContain("TYPE · GROCERIES");
    expect(t).toContain("1/18");
    expect(
      [...container.querySelectorAll('rect[width="8"][height="6"]')].filter(
        (r) => r.getAttribute("opacity") === "1",
      ),
    ).toHaveLength(1);
  });

  it("names a dual type when the runner-up is nearly level with the lead", () => {
    const rows = [
      tx({ category: "food", amount_usd_cents: 1000 }),
      tx({ category: "coffee", amount_usd_cents: 900, occurred_at: at(2026, 5, 2) }),
    ];
    const { texts, container } = renderCard(viewOf(rows));
    expect(texts()).toContain("TYPE · FOOD / COFFEE");
    // A dual type's art splits between the two colors instead of a spotlight.
    expect(container.querySelector('rect[fill="url(#card-dual-art)"]')).not.toBeNull();
    expect(container.querySelector('rect[fill="url(#card-spot)"]')).toBeNull();
  });

  it("uses the spotlight for a single type", () => {
    const { container } = renderCard(viewOf(TYPICAL));
    expect(container.querySelector('rect[fill="url(#card-spot)"]')).not.toBeNull();
    expect(container.querySelector('rect[fill="url(#card-dual-art)"]')).toBeNull();
  });

  it("stamps the region pill only when the month was typed in two or more currencies", () => {
    const one = renderCard(viewOf(TYPICAL));
    expect(one.texts()).not.toContain("1 CURRENCIES");
    expect(one.texts().some((s) => s?.endsWith("CURRENCIES"))).toBe(false);
    one.container.remove();
    const rows = [...TYPICAL, tx({ original_currency: "EUR", occurred_at: at(2026, 5, 6) })];
    const two = renderCard(viewOf(rows));
    expect(two.texts()).toContain("2 CURRENCIES");
  });

  describe("caption", () => {
    it("prints the flavor line on one line when it fits", () => {
      const { texts } = renderCard(viewOf(TYPICAL));
      expect(texts()).toContain("Fork it over, Doc. Every plate got logged.");
    });

    it("wraps a long flavor line over two lines", () => {
      const caption =
        "A flavor line long enough that it has to wrap, because the card is only so wide and the words keep coming.";
      const { texts } = renderCard(viewOf(TYPICAL, { title: { ...TITLE, caption } }));
      const lines = texts().filter((s) => caption.startsWith(s!) || caption.endsWith(s!));
      expect(lines).toHaveLength(2);
      expect(lines.join(" ")).toBe(caption);
    });

    it("leaves the flavor line out when the caption is off", () => {
      const { texts } = renderCard(viewOf(TYPICAL, { showCaption: false }));
      expect(texts()).not.toContain("Fork it over, Doc. Every plate got logged.");
      // The rest of the card is still there — the zones shift, nothing drops.
      expect(texts()).toContain("MY COLLECTION");
      expect(texts()).toContain("ENTRIES");
    });
  });

  describe("footer", () => {
    it("is MY COLLECTION without a name, with the rarity spelled out", () => {
      const { texts } = renderCard(viewOf(TYPICAL));
      expect(texts()).toContain("MY COLLECTION");
      expect(texts()).toContain("COMMON");
    });

    it("upper-cases the name into ALEX'S COLLECTION", () => {
      const { texts } = renderCard(viewOf(TYPICAL, { name: "Alex" }));
      expect(texts()).toContain("ALEX'S COLLECTION");
      expect(texts()).not.toContain("MY COLLECTION");
    });
  });

  it("marks the current month as still filling up", () => {
    const rows = [tx({ occurred_at: at(2026, 8, 10) })];
    const current = renderCard(viewOf(rows, {}, SEP, NOW));
    expect(current.texts()).toContain("MONTH SO FAR");
    expect(current.texts()).toContain("SEP 2026");
    current.container.remove();
    const past = renderCard(viewOf(TYPICAL));
    expect(past.texts()).not.toContain("MONTH SO FAR");
  });

  describe("habitat", () => {
    const habitatTile = (rows: Transaction[]) => {
      const { texts, container } = renderCard(viewOf(rows));
      expect(texts()).toContain("HABITAT");
      return { texts: texts(), container };
    };
    const texture = (container: HTMLElement, id: string) =>
      container.querySelector(`rect[fill="url(#card-${id})"]`);
    const rays = (container: HTMLElement) => container.querySelectorAll('line[stroke-width="22"]');

    it("is Anytime with no texture for a quiet month", () => {
      const { texts, container } = habitatTile(TYPICAL);
      expect(texts).toContain("Anytime");
      for (const id of ["dots", "grid", "stars"]) expect(texture(container, id)).toBeNull();
      expect(rays(container)).toHaveLength(0);
    });

    it("is Weekends over dots when Saturday and Sunday did the logging", () => {
      const { texts, container } = habitatTile(onDays([6, 7, 13, 14, 20, 21, 27, 28]));
      expect(texts).toContain("Weekends");
      expect(texture(container, "dots")).toHaveAttribute("opacity", "0.14");
    });

    it("is Weekdays over a grid for a nine-to-five month", () => {
      const { texts, container } = habitatTile(onDays([...range(1, 5), ...range(8, 12), ...range(15, 19)]));
      expect(texts).toContain("Weekdays");
      expect(texture(container, "grid")).not.toBeNull();
    });

    it("is After dark under stars for late-night logging", () => {
      const { texts, container } = habitatTile(onDays(range(1, 8), 23));
      expect(texts).toContain("After dark");
      expect(texture(container, "stars")).not.toBeNull();
    });

    it("is Sunrise with nine rays for early logging", () => {
      const { texts, container } = habitatTile(onDays(range(1, 8), 7));
      expect(texts).toContain("Sunrise");
      expect(rays(container)).toHaveLength(9);
      for (const id of ["dots", "grid", "stars"]) expect(texture(container, id)).toBeNull();
    });
  });

  describe("rarity", () => {
    const foil = (container: HTMLElement, id: string) =>
      container.querySelectorAll(`rect[fill="url(#card-${id})"]`);
    const litStars = (container: HTMLElement) =>
      [...container.querySelectorAll("polygon")].filter((p) => p.getAttribute("opacity") === "1");

    it("Common: a plain frame, no foil over the name plate, no glints, one star", () => {
      const { container, texts } = renderCard(viewOf(onDays([1, 2, 3])));
      expect(texts()).toContain("COMMON");
      for (const id of ["sheen", "silver", "holo", "gold", "holo2"]) expect(foil(container, id)).toHaveLength(0);
      expect(container.querySelectorAll("path[transform^='translate']")).toHaveLength(0);
      expect(litStars(container)).toHaveLength(1);
    });

    it("Uncommon: the type's sheen on the frame and, faintly, over the plate", () => {
      const { container, texts } = renderCard(viewOf(onDays(range(1, 11))));
      expect(texts()).toContain("UNCOMMON");
      expect(texts()).toContain("11/30");
      const sheen = foil(container, "sheen");
      expect(sheen).toHaveLength(2);
      expect(sheen[1]).toHaveAttribute("opacity", "0.12");
      expect(litStars(container)).toHaveLength(2);
    });

    it("Rare: silver on the frame and the plate", () => {
      const { container, texts } = renderCard(viewOf(onDays(range(1, 18))));
      expect(texts()).toContain("RARE");
      const silver = foil(container, "silver");
      expect(silver).toHaveLength(2);
      expect(silver[1]).toHaveAttribute("opacity", "0.22");
      expect(foil(container, "holo")).toHaveLength(0);
      expect(litStars(container)).toHaveLength(3);
    });

    it("Epic: holo on the frame, the plate and over the art, but no legendary stamp", () => {
      const { container, texts } = renderCard(viewOf(onDays(range(1, 24))));
      expect(texts()).toContain("EPIC");
      expect(texts()).not.toContain("★ LEGENDARY ★");
      expect(foil(container, "holo")).toHaveLength(3);
      expect(foil(container, "holo2")).toHaveLength(0);
      expect(litStars(container)).toHaveLength(4);
    });

    it("Legendary: gold frame, a holo wash clipped to the card, the stamp and gold stars", () => {
      const { container, texts } = renderCard(viewOf(onDays(range(1, 30))));
      expect(texts()).toContain("LEGENDARY");
      expect(texts()).toContain("★ LEGENDARY ★");
      expect(texts()).toContain("30/30");
      // Frame, plate and the stamp's pill all wear gold.
      expect(foil(container, "gold")).toHaveLength(3);
      const wash = foil(container, "holo2");
      expect(wash).toHaveLength(1);
      expect(wash[0]).toHaveAttribute("clip-path", "url(#card-card-clip)");
      expect(wash[0]).toHaveAttribute("opacity", "0.12");
      expect(foil(container, "holo")).toHaveLength(1);
      expect(container.querySelector("#card-card-clip")).not.toBeNull();
      const stars = litStars(container);
      expect(stars).toHaveLength(5);
      for (const s of stars) expect(s).toHaveAttribute("fill", "#d99a1e");
      // Seven glints for a legendary month.
      expect(container.querySelectorAll("path[transform^='translate']")).toHaveLength(7);
    });
  });
});
