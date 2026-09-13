import { describe, it, expect } from "vitest";
import { categoryColor, categoryIcon } from "@/lib/categories";
import { RARITIES, REST_ID, monthFacts, nextRarity, rarityOf, type Rarity } from "@/lib/recap";
import { habitatOf, revealLine, type RecapTitle } from "@/lib/recapTitles";
import {
  DUAL_TYPE_RATIO,
  MAX_STAMPS,
  buildRecapView,
  sparklesFor,
  type RecapChoices,
} from "@/lib/recapView";
import type { Transaction } from "@/types/db";

// Fixtures go through the local-time Date constructor at noon so the day
// they land on is the same in any timezone.
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

// 13 Sep 2026: September is 13 days in.
const NOW = new Date(2026, 8, 13, 12);
const SEP = "2026-09";
const JUN = "2026-06";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1000,
    original_currency: "USD",
    original_amount: 10,
    rate_used: 1,
    occurred_at: at(2026, 8, 10),
    note: null,
    created_at: at(2026, 8, 10),
    ...overrides,
  };
}

// One row per category, all on the 10th of the month `key`, `cents` each.
function spend(cents: Record<string, number>, key = SEP, now = NOW) {
  const [y, m] = key.split("-").map(Number);
  const rows = Object.entries(cents).map(([category, amount], i) =>
    tx({ id: `${category}-${i}`, category, amount_usd_cents: amount, occurred_at: at(y, m - 1, 10) }),
  );
  return monthFacts(rows, key, now);
}

const title = (id: string, text = `${id.toUpperCase()}.`): RecapTitle => ({
  id,
  title: text,
  caption: `Caption for ${id}`,
  tier: "everyday",
});

function choices(overrides: Partial<RecapChoices> = {}): RecapChoices {
  return {
    title: title("aisle_five_alive", "AISLE FIVE ALIVE."),
    stamps: [],
    showCaption: true,
    showAmounts: true,
    name: "Nizar",
    currency: "USD",
    ...overrides,
  };
}

describe("buildRecapView", () => {
  it("carries the facts, rarity, title, and the user's choices through", () => {
    const facts = spend({ groceries: 1000 });
    const view = buildRecapView(facts, choices());
    expect(view.facts).toBe(facts);
    expect(view.rarity).toBe(rarityOf(facts));
    expect(view.title.id).toBe("aisle_five_alive");
    expect(view.caption).toBe("Caption for aisle_five_alive");
    expect(view.name).toBe("Nizar");
    expect(view.showAmounts).toBe(true);
    expect(view.currency).toBe("USD");
  });

  it("turns the top categories into moves with a nickname, color and icon, biggest first", () => {
    const view = buildRecapView(spend({ groceries: 1000, food: 500, coffee: 250 }), choices());
    expect(view.moves.map((m) => m.id)).toEqual(["groceries", "food", "coffee"]);
    expect(view.moves.map((m) => m.name)).toEqual(["Cart charge", "Fork lift", "Espresso shot"]);
    expect(view.moves[0].color).toBe(categoryColor("groceries"));
    expect(view.moves[0].icon).toBe(categoryIcon("groceries"));
    expect(view.moves[1].color).toBe(categoryColor("food"));
    // The split's numbers ride along untouched.
    expect(view.moves[0].percent).toBe(57);
    expect(view.moves[0].share).toBeCloseTo(1000 / 1750);
  });

  it("splits off the remainder as rest when there are more than three categories", () => {
    const view = buildRecapView(
      spend({ groceries: 1000, food: 500, coffee: 250, gas: 100, parking: 50 }),
      choices(),
    );
    expect(view.moves.map((m) => m.id)).toEqual(["groceries", "food", "coffee"]);
    expect(view.rest).not.toBeNull();
    expect(view.rest!.id).toBe(REST_ID);
    expect(view.rest!.cents).toBe(150);
    // The remainder never becomes a move.
    expect(view.moves.some((m) => m.id === REST_ID)).toBe(false);
  });

  it("has no rest with three categories or fewer", () => {
    expect(buildRecapView(spend({ groceries: 1000, food: 500, coffee: 250 }), choices()).rest).toBeNull();
    expect(buildRecapView(spend({ groceries: 1000 }), choices()).rest).toBeNull();
  });

  it("makes the biggest category the lead", () => {
    const view = buildRecapView(spend({ food: 300, groceries: 1000 }), choices());
    expect(view.lead).toBe(view.moves[0]);
    expect(view.lead.id).toBe("groceries");
  });

  it("is a dual type when the runner-up is within the ratio of the lead", () => {
    // 900 / 1900 = 0.474 ≥ 0.8 × 0.526.
    const view = buildRecapView(spend({ groceries: 1000, food: 900 }), choices());
    expect(view.second).toBe(view.moves[1]);
    expect(view.second!.id).toBe("food");
    expect(view.moves[1].share).toBeGreaterThanOrEqual(DUAL_TYPE_RATIO * view.moves[0].share);
  });

  it("is a single type when the runner-up trails, or there is none", () => {
    // 500 / 1500 = 0.333 < 0.8 × 0.667.
    expect(buildRecapView(spend({ groceries: 1000, food: 500 }), choices()).second).toBeNull();
    expect(buildRecapView(spend({ groceries: 1000 }), choices()).second).toBeNull();
  });

  it("drops the caption when it's turned off", () => {
    expect(buildRecapView(spend({ groceries: 1000 }), choices({ showCaption: false })).caption).toBeNull();
    expect(buildRecapView(spend({ groceries: 1000 }), choices({ showCaption: true })).caption).toBe(
      "Caption for aisle_five_alive",
    );
  });

  it("passes an empty name and hidden amounts through", () => {
    const view = buildRecapView(spend({ groceries: 1000 }), choices({ name: "", showAmounts: false }));
    expect(view.name).toBe("");
    expect(view.showAmounts).toBe(false);
  });

  it("stamps the other titles without the chosen one, at most MAX_STAMPS, minus the period", () => {
    const chosen = title("clockwork", "CLOCKWORK.");
    const stamps = [
      title("passport_stamped", "PASSPORT STAMPED."),
      chosen,
      title("seven_straight", "SEVEN STRAIGHT."),
      title("thats_all_forks", "THAT'S ALL, FORKS."),
      title("first_hop", "FIRST HOP."),
      title("in_the_binder", "IN THE BINDER."),
    ];
    const view = buildRecapView(spend({ groceries: 1000 }), choices({ title: chosen, stamps }));
    expect(view.stamps).toHaveLength(MAX_STAMPS);
    expect(view.stamps).toEqual(["PASSPORT STAMPED", "SEVEN STRAIGHT", "THAT'S ALL, FORKS"]);
  });

  it("strips only a trailing period from a stamp", () => {
    const view = buildRecapView(
      spend({ groceries: 1000 }),
      choices({ stamps: [title("misc_maestro", "MISC. MAESTRO."), title("no_dot", "NO DOT")] }),
    );
    expect(view.stamps).toEqual(["MISC. MAESTRO", "NO DOT"]);
  });

  it("has no stamps when only the chosen title is eligible", () => {
    const chosen = title("first_hop", "FIRST HOP.");
    expect(buildRecapView(spend({ groceries: 1000 }), choices({ title: chosen, stamps: [chosen] })).stamps).toEqual([]);
  });

  it("says what's next for the current month and nothing for a past one", () => {
    const current = spend({ groceries: 1000 }, SEP, NOW);
    const view = buildRecapView(current, choices());
    expect(view.nextUp).toEqual(nextRarity(current));
    expect(view.nextUp).toEqual({ rarity: "uncommon", days: 10 });

    const past = spend({ groceries: 1000 }, JUN, NOW);
    expect(buildRecapView(past, choices()).nextUp).toBeNull();
  });

  it("fills the habitat and reveal from the facts", () => {
    const facts = spend({ groceries: 1000 }, JUN);
    const view = buildRecapView(facts, choices());
    expect(view.habitat).toBe(habitatOf(facts));
    expect(view.habitat).toBe("anytime");
    expect(view.reveal).toBe(revealLine(facts));
    expect(view.reveal).toBe("1 of 30 days logged.");
  });

  it("places the month's sparkles by its key and rarity", () => {
    const facts = spend({ groceries: 1000 }, JUN);
    const view = buildRecapView(facts, choices());
    expect(view.rarity).toBe("common");
    expect(view.sparkles).toEqual(sparklesFor(JUN, "common"));
    expect(view.sparkles).toEqual([]);
  });
});

describe("sparklesFor", () => {
  const COUNTS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 4, legendary: 7 };

  it("draws more glints the rarer the card: 0, 1, 2, 4, 7", () => {
    for (const { id } of RARITIES) {
      expect(sparklesFor(SEP, id), id).toHaveLength(COUNTS[id]);
    }
  });

  it("lands in the same places every time for the same key", () => {
    expect(sparklesFor(SEP, "legendary")).toEqual(sparklesFor(SEP, "legendary"));
    expect(sparklesFor("2025-01", "epic")).toEqual(sparklesFor("2025-01", "epic"));
  });

  it("lands somewhere else for a different key", () => {
    expect(sparklesFor(SEP, "legendary")).not.toEqual(sparklesFor("2026-10", "legendary"));
    expect(sparklesFor("a", "rare")).not.toEqual(sparklesFor("b", "rare"));
  });

  it("keeps every glint in the side bands of the art zone, small, and barely turned", () => {
    const keys = ["2026-09", "2026-10", "2025-01", "2024-02", "2023-12", "x", "yy"];
    let left = 0;
    let right = 0;
    for (const key of keys) {
      for (const s of sparklesFor(key, "legendary")) {
        // Off the very middle, where the icon sits: a left or a right band.
        const inLeft = s.x >= 0.06 && s.x <= 0.26;
        const inRight = s.x >= 0.74 && s.x <= 0.94;
        expect(inLeft || inRight, `${key} x=${s.x}`).toBe(true);
        if (inLeft) left += 1;
        else right += 1;
        expect(s.y).toBeGreaterThanOrEqual(0.08);
        expect(s.y).toBeLessThanOrEqual(0.92);
        expect(s.r).toBeGreaterThanOrEqual(0.5);
        expect(s.r).toBeLessThanOrEqual(1.1);
        expect(Number.isInteger(s.rotate)).toBe(true);
        expect(s.rotate).toBeGreaterThanOrEqual(0);
        expect(s.rotate).toBeLessThanOrEqual(45);
      }
    }
    // Both bands get used across the run, so neither side is ever bare.
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
  });
});
