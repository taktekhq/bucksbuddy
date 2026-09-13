import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { monthFacts } from "@/lib/recap";
import { FONT_FAMILY } from "@/lib/recapText";
import type { RecapTitle } from "@/lib/recapTitles";
import { buildRecapView, type RecapChoices, type RecapView } from "@/lib/recapView";
import { RecapStory, STORY_WIDTH, STORY_HEIGHT } from "@/components/recap/RecapStory";
import type { Transaction } from "@/types/db";

// Fixtures go through the local-time Date constructor (noon unless the test
// is about the hour) so day and hour bucketing is deterministic in any
// timezone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

// June 2026: a past month with 30 days. September 2026 is the month `NOW` is in.
const JUN = "2026-06";
const SEP = "2026-09";
const NOW = new Date(2026, 8, 13, 12);

const TITLE: RecapTitle = {
  id: "thats_all_forks",
  title: "THAT'S ALL, FORKS.",
  caption: "Fork it over, Doc. Every plate got logged.",
  tier: "everyday",
};
const STAMPS: RecapTitle[] = [
  TITLE, // the headline never rides along as its own stamp
  { id: "seven_straight", title: "SEVEN STRAIGHT.", caption: "", tier: "notable" },
  { id: "globetrotter", title: "GLOBETROTTER.", caption: "", tier: "notable" },
];

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

// One groceries row on each of the given days of a month (June by default).
function onDays(days: number[], month = 5): Transaction[] {
  return days.map((d) => tx({ occurred_at: at(2026, month, d) }));
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

function renderStory(view: RecapView) {
  const { container } = render(<RecapStory view={view} />);
  const texts = () => [...container.querySelectorAll("text")].map((t) => t.textContent);
  // The title is the Grobold text that isn't the wordmark, joined across lines.
  const titleLines = () =>
    [...container.querySelectorAll("text")]
      .filter((t) => t.getAttribute("font-family") === FONT_FAMILY.grobold)
      .map((t) => t.textContent!)
      .filter((s) => s !== "BUCKS" && s !== "BUDDY");
  return { container, texts, titleLines };
}

describe("RecapStory", () => {
  it("is one 9:16 SVG named by its title, rarity and month, and forwards its ref", () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(<RecapStory ref={ref} view={viewOf(TYPICAL)} />);
    const svg = screen.getByRole("img", { name: "THAT'S ALL, FORKS. Common story for June 2026" });
    expect(svg).toHaveAttribute("viewBox", `0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`);
    expect(ref.current).toBe(svg);
    expect(container.firstChild).toBe(svg);
  });

  it("opens with the month, MY MONTH WAS, the title and the rarity · type line", () => {
    const { texts, titleLines } = renderStory(viewOf(TYPICAL));
    const t = texts();
    expect(t).toContain("JUNE 2026");
    expect(t).toContain("MY MONTH WAS");
    expect(titleLines().join(" ")).toBe("THAT'S ALL, FORKS.");
    expect(t).toContain("COMMON · FOOD TYPE");
    expect(t).toContain("bucksbuddy.com");
    expect(t).toContain("LOG IT. COLLECT IT.");
    expect(t).not.toContain("MONTH SO FAR");
  });

  it("addresses the month to its owner when a name is on", () => {
    const { texts } = renderStory(viewOf(TYPICAL, { name: "Alex" }));
    expect(texts()).toContain("ALEX, YOUR MONTH WAS");
    expect(texts()).not.toContain("MY MONTH WAS");
  });

  it("wraps a long title over three lines", () => {
    const long = { ...TITLE, title: "THE LONGEST TITLE IN THE WHOLE BINDER." };
    const { titleLines } = renderStory(viewOf(TYPICAL, { title: long }));
    expect(titleLines()).toHaveLength(3);
    expect(titleLines().join(" ")).toBe("THE LONGEST TITLE IN THE WHOLE BINDER.");
  });

  it("names a dual type", () => {
    const rows = [
      tx({ category: "food", amount_usd_cents: 1000 }),
      tx({ category: "coffee", amount_usd_cents: 900, occurred_at: at(2026, 5, 2) }),
    ];
    const { texts, container } = renderStory(viewOf(rows));
    expect(texts()).toContain("COMMON · FOOD / COFFEE TYPE");
    // The ground fades into the second type's ink instead of the lead's.
    const stops = [...container.querySelectorAll("#story-bg stop")].map((s) => s.getAttribute("stop-color"));
    expect(stops).toHaveLength(3);
    expect(stops[2]).not.toBe(stops[1]);
  });

  describe("stamps", () => {
    it("shows the other titles the month earned as pills, minus their periods", () => {
      const { texts } = renderStory(viewOf(TYPICAL, { stamps: STAMPS }));
      expect(texts()).toContain("SEVEN STRAIGHT");
      expect(texts()).toContain("GLOBETROTTER");
      // The headline is filtered out of the stamps, not repeated.
      expect(texts().filter((s) => s === "THAT'S ALL, FORKS")).toHaveLength(0);
    });

    it("draws no pills when there are no extra titles", () => {
      const { container, texts } = renderStory(viewOf(TYPICAL));
      expect(container.querySelectorAll('rect[height="52"][rx="26"]')).toHaveLength(0);
      expect(texts()).not.toContain("SEVEN STRAIGHT");
    });
  });

  describe("where it went", () => {
    it("ranks every top category with its amount and percent, then Everything else with a … chip", () => {
      const { texts } = renderStory(viewOf(TYPICAL));
      const t = texts();
      expect(t).toContain("WHERE IT WENT");
      expect(t).toContain("Food · $30.00");
      expect(t).toContain("Groceries · $20.00");
      expect(t).toContain("Coffee · $10.00");
      expect(t).toContain("Everything else · $5.00");
      expect(t).toContain("…");
      expect(t).toContain("46");
      expect(t).toContain("31");
      expect(t).toContain("15");
      expect(t).toContain("8");
      expect(t.filter((s) => s === "%")).toHaveLength(4);
    });

    it("leaves the amounts off when they are hidden", () => {
      const { texts } = renderStory(viewOf(TYPICAL, { showAmounts: false }));
      expect(texts()).toContain("Food");
      expect(texts()).toContain("Everything else");
      expect(texts()).not.toContain("Food · $30.00");
    });

    it("has no Everything else row, and no … chip, for three categories or fewer", () => {
      const { texts } = renderStory(viewOf(TYPICAL.slice(0, 4)));
      expect(texts()).not.toContain("Everything else · $5.00");
      expect(texts()).not.toContain("…");
      expect(texts().filter((s) => s === "%")).toHaveLength(3);
    });

    it("draws a single-category month as one row at 100", () => {
      const { texts } = renderStory(viewOf(onDays([1, 2, 3])));
      expect(texts()).toContain("Groceries · $30.00");
      expect(texts()).toContain("100");
      expect(texts().filter((s) => s === "%")).toHaveLength(1);
    });
  });

  describe("stat tiles", () => {
    it("shows entries, days, streak and the total when amounts are on", () => {
      const { texts } = renderStory(viewOf(TYPICAL));
      const t = texts();
      expect(t).toContain("ENTRIES LOGGED");
      expect(t).toContain("DAYS LOGGED");
      expect(t).toContain("5/30");
      expect(t).toContain("DAY STREAK");
      expect(t).toContain("TOTAL LOGGED");
      expect(t).toContain("$65.00");
      expect(t).not.toContain("CATEGORIES");
    });

    it("swaps the total for the category count when amounts are hidden", () => {
      const { texts } = renderStory(viewOf(TYPICAL, { showAmounts: false }));
      expect(texts()).toContain("CATEGORIES");
      expect(texts()).toContain("4");
      expect(texts()).not.toContain("TOTAL LOGGED");
      expect(texts()).not.toContain("$65.00");
    });
  });

  it("prints the reveal line under the numbers", () => {
    const view = viewOf(TYPICAL);
    const { texts } = renderStory(view);
    expect(view.reveal).toBe("5 of 30 days logged.");
    expect(texts()).toContain(view.reveal);
  });

  describe("caption", () => {
    it("prints the flavor line", () => {
      const { texts } = renderStory(viewOf(TYPICAL));
      expect(texts()).toContain("Fork it over, Doc. Every plate got logged.");
    });

    it("wraps a long flavor line", () => {
      const caption =
        "A flavor line long enough that it has to wrap, because the story is only so wide and the words keep coming and coming.";
      const { texts } = renderStory(viewOf(TYPICAL, { title: { ...TITLE, caption } }));
      const lines = texts().filter((s) => caption.includes(s!) && s!.length > 10);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.join(" ")).toBe(caption);
    });

    it("leaves the flavor line out when the caption is off", () => {
      const { texts } = renderStory(viewOf(TYPICAL, { showCaption: false }));
      expect(texts()).not.toContain("Fork it over, Doc. Every plate got logged.");
      expect(texts()).toContain("5 of 30 days logged.");
    });
  });

  describe("what's still in reach", () => {
    it("says nothing for a past month", () => {
      const { texts } = renderStory(viewOf(TYPICAL));
      expect(texts().some((s) => s?.startsWith("LOG "))).toBe(false);
    });

    it("tells the current month how many more days reach the next rarity", () => {
      // Three of thirteen days: Common, eight more logged days make Uncommon.
      const { texts } = renderStory(viewOf(onDays([1, 2, 3], 8), {}, SEP, NOW));
      expect(texts()).toContain("MONTH SO FAR");
      expect(texts()).toContain("SEPTEMBER 2026");
      expect(texts()).toContain("LOG 8 MORE DAYS FOR UNCOMMON");
    });

    it("uses the singular when one day is all that's missing", () => {
      // Every day but the last of September, seen from the last: one to Legendary.
      const view = viewOf(onDays(range(1, 29), 8), {}, SEP, new Date(2026, 8, 30, 12));
      const { texts } = renderStory(view);
      expect(view.nextUp).toEqual({ rarity: "legendary", days: 1 });
      expect(texts()).toContain("LOG 1 MORE DAY FOR LEGENDARY");
    });
  });

  describe("rarity", () => {
    const foil = (container: HTMLElement, id: string) =>
      container.querySelectorAll(`rect[fill="url(#story-${id})"]`);
    const litStars = (container: HTMLElement) =>
      [...container.querySelectorAll("polygon")].filter((p) => p.getAttribute("opacity") === "1");

    it("Common: no foil over the plate, no holo wash, no glints", () => {
      const { container, texts } = renderStory(viewOf(onDays([1, 2, 3])));
      expect(texts()).toContain("COMMON · GROCERIES TYPE");
      for (const id of ["sheen", "silver", "holo", "gold"]) expect(foil(container, id)).toHaveLength(0);
      expect(container.querySelectorAll("path[transform^='translate']")).toHaveLength(0);
      expect(litStars(container)).toHaveLength(1);
    });

    it("Uncommon: the type's sheen over the plate, faintly", () => {
      const { container, texts } = renderStory(viewOf(onDays(range(1, 11))));
      expect(texts()).toContain("UNCOMMON · GROCERIES TYPE");
      const sheen = foil(container, "sheen");
      expect(sheen).toHaveLength(1);
      expect(sheen[0]).toHaveAttribute("opacity", "0.12");
      expect(litStars(container)).toHaveLength(2);
    });

    it("Rare: silver over the plate", () => {
      const { container, texts } = renderStory(viewOf(onDays(range(1, 18))));
      expect(texts()).toContain("RARE · GROCERIES TYPE");
      const silver = foil(container, "silver");
      expect(silver).toHaveLength(1);
      expect(silver[0]).toHaveAttribute("opacity", "0.2");
      expect(foil(container, "holo")).toHaveLength(0);
      expect(litStars(container)).toHaveLength(3);
    });

    it("Epic: a holo wash over the ground and holo on the plate", () => {
      const { container, texts } = renderStory(viewOf(onDays(range(1, 24))));
      expect(texts()).toContain("EPIC · GROCERIES TYPE");
      const holo = foil(container, "holo");
      expect(holo).toHaveLength(2);
      expect(holo[0]).toHaveAttribute("opacity", "0.16");
      expect(litStars(container)).toHaveLength(4);
    });

    it("Legendary: the holo wash, gold on the plate, gold stars and seven glints", () => {
      const { container, texts } = renderStory(viewOf(onDays(range(1, 30))));
      expect(texts()).toContain("LEGENDARY · GROCERIES TYPE");
      expect(texts()).toContain("30/30");
      expect(foil(container, "holo")).toHaveLength(1);
      expect(foil(container, "gold")).toHaveLength(1);
      const stars = litStars(container);
      expect(stars).toHaveLength(5);
      for (const s of stars) expect(s).toHaveAttribute("fill", "#d99a1e");
      expect(container.querySelectorAll("path[transform^='translate']")).toHaveLength(7);
    });
  });
});
