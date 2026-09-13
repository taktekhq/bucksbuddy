import { describe, it, expect } from "vitest";
import {
  FALLBACK_TITLES,
  HABITAT_LABEL,
  TITLE_COUNT,
  defaultTitle,
  earnedTitles,
  eligibleTitles,
  habitatOf,
  monthSeed,
  nickname,
  revealLine,
  type RecapTitle,
} from "@/lib/recapTitles";
import { monthFacts, parseMonthKey, type MonthFacts } from "@/lib/recap";
import type { Transaction } from "@/types/db";

// Every fixture is a list of row specs — a category, a day of the month, an
// hour, cents and a currency — turned into transactions in one month. Dates
// go through the local-time Date constructor so the weekday and hour buckets
// come out the same in any timezone.
type Spec = { c: string; d?: number; h?: number; cents?: number; cur?: string };

// The 30th of September 2026 at noon: September is the current month with
// all thirty days available, so its coverage is simply days logged / 30.
const NOW = new Date(2026, 8, 30, 12);
const SEP = "2026-09";
const AUG = "2026-08";
const JUL = "2026-07";
const JUN = "2026-06";
const OCT = "2026-10";
const DEC = "2026-12";
const FEB = "2026-02";

// September 2026: the 7th–11th are Monday to Friday, the 12th and 13th a
// weekend. The default day, the 10th, is a Thursday.
const WEEKDAYS = [7, 8, 9, 10, 11];
const WEEKEND = [12, 13];

// A row big enough to be the lead category on its own, for rules that must
// be earned by count rather than by leading.
const BIG_RENT: Spec = { c: "rent", cents: 100_000 };

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 100,
    original_currency: "USD",
    original_amount: 1,
    rate_used: 1,
    occurred_at: new Date(2026, 8, 10, 12).toISOString(),
    note: null,
    created_at: new Date(2026, 8, 10, 12).toISOString(),
    ...overrides,
  };
}

function build(specs: Spec[], key: string): Transaction[] {
  const month = parseMonthKey(key)!;
  return specs.map((s, i) =>
    tx({
      id: `r${i}`,
      category: s.c,
      amount_usd_cents: s.cents ?? 100,
      original_currency: (s.cur ?? "USD") as Transaction["original_currency"],
      occurred_at: new Date(month.getFullYear(), month.getMonth(), s.d ?? 10, s.h ?? 12).toISOString(),
    }),
  );
}

const facts = (specs: Spec[], key = SEP, now = NOW): MonthFacts =>
  monthFacts(build(specs, key), key, now);

// `n` rows of one category, cycling through `days` (the 10th by default).
function many(n: number, c: string, extra: Partial<Spec> & { days?: number[] } = {}): Spec[] {
  const { days, ...rest } = extra;
  return Array.from({ length: n }, (_, i) => ({
    c,
    ...rest,
    ...(days ? { d: days[i % days.length] } : {}),
  }));
}

// `perDay` groceries rows on each of the first `days` days of a month.
function everyDay(days: number, perDay = 1): Spec[] {
  return Array.from({ length: days * perDay }, (_, i) => ({
    c: "groceries",
    d: Math.floor(i / perDay) + 1,
  }));
}

const ids = (titles: RecapTitle[]) => titles.map((t) => t.id);
const earnedIds = (specs: Spec[], key = SEP, now = NOW) => ids(earnedTitles(facts(specs, key, now)));

const TWELVE = [
  "groceries",
  "food",
  "coffee",
  "gas",
  "parking",
  "transport",
  "shopping",
  "self_care",
  "gym",
  "health",
  "fees",
  "fun",
];

type Case = { id: string; why: string; rows: Spec[]; key?: string; now?: Date };

// One month per title that earns it — two where a rule has an "or" so each
// side gets to decide on its own.
const EARNS: Case[] = [
  // --- legendary ---
  { id: "full_moon", why: "every day of the month logged", rows: everyDay(30) },
  { id: "century_club", why: "a hundred entries", rows: many(100, "groceries") },
  { id: "leap_day_logger", why: "a row on 29 Feb", key: "2028-02", rows: [{ c: "groceries", d: 29 }] },
  // --- rare ---
  {
    id: "passport_stamped",
    why: "three currencies",
    rows: ["USD", "EUR", "LBP"].map((cur) => ({ c: "food", cur })),
  },
  { id: "clockwork", why: "24 of June's 30 days", key: JUN, rows: everyDay(24) },
  { id: "three_week_streak", why: "21 straight days, not the whole month", rows: everyDay(21) },
  { id: "half_century", why: "fifty entries", rows: many(50, "groceries") },
  { id: "full_spectrum", why: "twelve categories", rows: TWELVE.map((c) => ({ c })) },
  {
    id: "triple_threat",
    why: "ten entries, three shares within 5 points",
    rows: [
      ...many(4, "food", { cents: 100 }),
      ...many(3, "groceries", { cents: 130 }),
      ...many(3, "coffee", { cents: 130 }),
    ],
  },
  { id: "home_barista", why: "three bean buys", rows: many(3, "coffee/beans") },
  { id: "carrots_doc", why: "four produce runs", rows: many(4, "groceries/produce") },
  { id: "frequent_flyer", why: "two flights", rows: many(2, "transport/flight") },
  { id: "front_row", why: "two events", rows: many(2, "fun/events") },
  { id: "good_egg", why: "one donation", rows: [{ c: "gifts/donation" }] },
  { id: "big_tipper", why: "tips lead the month", rows: [{ c: "tips" }] },
  { id: "big_tipper", why: "eight tips under a bigger lead", rows: [...many(8, "tips"), BIG_RENT] },
  { id: "santas_intern", why: "three gifts in December", key: DEC, rows: many(3, "gifts") },
  { id: "summer_getaway", why: "a July flight", key: JUL, rows: [{ c: "transport/flight" }] },
  { id: "summer_getaway", why: "a July airbnb", key: JUL, rows: [{ c: "rent/airbnb" }] },
  {
    id: "summer_getaway",
    why: "two currencies in July",
    key: JUL,
    rows: [{ c: "food", cur: "USD" }, { c: "food", cur: "EUR" }],
  },
  // --- notable ---
  {
    id: "globetrotter",
    why: "exactly two currencies",
    rows: [{ c: "food", cur: "USD" }, { c: "food", cur: "EUR" }],
  },
  { id: "fortnight_flame", why: "a 14-day streak", rows: everyDay(14) },
  { id: "seven_straight", why: "a 7-day streak", rows: everyDay(7) },
  {
    id: "weekend_wabbit",
    why: "5 of 8 entries on the weekend",
    rows: [...many(5, "food", { days: WEEKEND }), ...many(3, "food", { days: WEEKDAYS })],
  },
  { id: "nine_to_fiver", why: "15 weekday entries", rows: many(15, "food", { days: WEEKDAYS }) },
  {
    id: "after_hours",
    why: "2 of 8 entries at 23:00",
    rows: [...many(2, "food", { h: 23 }), ...many(6, "food")],
  },
  {
    id: "early_bird",
    why: "3 of 8 entries at 07:00",
    rows: [...many(3, "food", { h: 7 }), ...many(5, "food")],
  },
  {
    id: "main_character",
    why: "five food rows worth 83% across three categories",
    rows: [...many(5, "food", { cents: 200 }), { c: "groceries" }, { c: "coffee" }],
  },
  {
    id: "one_big_hop",
    why: "one of 8 entries is 93% of the total",
    rows: [{ c: "food", cents: 10_000 }, ...many(7, "food")],
  },
  { id: "doorbell_diner", why: "four deliveries", rows: many(4, "food/delivery") },
  { id: "reservation_held", why: "four restaurants", rows: many(4, "food/restaurant") },
  { id: "snack_attack", why: "five snacks", rows: many(5, "food/snacks") },
  { id: "cafe_regular", why: "six cafés", rows: many(6, "coffee/cafe") },
  { id: "bread_winner", why: "four bakery runs", rows: many(4, "groceries/bakery") },
  { id: "backseat_boss", why: "four taxis", rows: many(4, "transport/taxi") },
  {
    id: "pit_crew",
    why: "one of each upkeep subcategory",
    rows: ["service", "repairs", "wash", "insurance", "registration"].map((s) => ({
      c: `transport/${s}`,
    })),
  },
  { id: "auto_renewed", why: "three subscriptions", rows: many(3, "fees/subscriptions") },
  { id: "wardrobe_update", why: "three clothes buys", rows: many(3, "shopping/clothes") },
  { id: "fresh_set", why: "two nail visits", rows: many(2, "self_care/nails") },
  { id: "popcorn_patron", why: "three movies", rows: many(3, "fun/movies") },
  { id: "player_one", why: "three games", rows: many(3, "fun/games") },
  { id: "rep_machine", why: "gym leads with two", rows: many(2, "gym") },
  { id: "rep_machine", why: "eight gym rows under a bigger lead", rows: [...many(8, "gym"), BIG_RENT] },
  { id: "gift_horse", why: "gifts lead outside December", rows: many(2, "gifts") },
  { id: "cupids_courier", why: "two gifts in February", key: FEB, rows: many(2, "gifts") },
  { id: "spooky_season", why: "fun in October", key: OCT, rows: [{ c: "fun" }] },
  {
    id: "spooky_season",
    why: "four snacks in October under a bigger lead",
    key: OCT,
    rows: [...many(4, "food/snacks"), BIG_RENT],
  },
  // --- everyday ---
  { id: "aisle_five_alive", why: "four groceries lead", rows: many(4, "groceries") },
  { id: "thats_all_forks", why: "four food lead", rows: many(4, "food") },
  { id: "bean_counter", why: "four coffees lead", rows: many(4, "coffee") },
  { id: "bean_counter", why: "twelve coffees under a bigger lead", rows: [...many(12, "coffee"), BIG_RENT] },
  { id: "tank_you", why: "three gas lead", rows: many(3, "gas") },
  { id: "spot_hunter", why: "four parkings lead", rows: many(4, "parking") },
  { id: "spot_hunter", why: "ten parkings under a bigger lead", rows: [...many(10, "parking"), BIG_RENT] },
  { id: "on_the_move", why: "four transport lead", rows: many(4, "transport") },
  { id: "bag_of_tricks", why: "three shopping lead", rows: many(3, "shopping") },
  { id: "glow_getter", why: "two self care lead", rows: many(2, "self_care") },
  { id: "tune_up_month", why: "two doctor visits lead", rows: many(2, "health/doctor") },
  { id: "fine_print_reader", why: "three fees lead", rows: many(3, "fees") },
  { id: "homebody", why: "one rent row leads", rows: [{ c: "rent" }] },
  { id: "fun_committee", why: "three fun lead", rows: many(3, "fun") },
  { id: "business_casual", why: "three work lead", rows: many(3, "work") },
  { id: "burrow_boss", why: "two family lead", rows: many(2, "family") },
  { id: "misc_maestro", why: "four other lead", rows: many(4, "other") },
];

// The guard on each rule: a month one notch short, or in the wrong month.
const DENIES: Case[] = [
  // --- legendary ---
  {
    id: "full_moon",
    why: "full coverage only three days into the month",
    rows: everyDay(7),
    now: new Date(2026, 8, 3, 12),
  },
  { id: "century_club", why: "99 entries", rows: many(99, "groceries") },
  { id: "leap_day_logger", why: "the 29th of a month that isn't February", rows: [{ c: "groceries", d: 29 }] },
  // --- rare ---
  {
    id: "passport_stamped",
    why: "two currencies",
    rows: [{ c: "food", cur: "USD" }, { c: "food", cur: "EUR" }],
  },
  { id: "clockwork", why: "every day: that's a Full Moon", rows: everyDay(30) },
  { id: "clockwork", why: "23 of June's 30 days", key: JUN, rows: everyDay(23) },
  { id: "three_week_streak", why: "a streak that covers the whole month", rows: everyDay(30) },
  { id: "three_week_streak", why: "20 days", rows: everyDay(20) },
  { id: "half_century", why: "a hundred: that's the Century Club", rows: many(100, "groceries") },
  { id: "half_century", why: "49 entries", rows: many(49, "groceries") },
  { id: "full_spectrum", why: "eleven categories", rows: TWELVE.slice(0, 11).map((c) => ({ c })) },
  {
    id: "triple_threat",
    why: "a three-way tie with only nine entries",
    rows: [...many(3, "food"), ...many(3, "groceries"), ...many(3, "coffee")],
  },
  {
    id: "triple_threat",
    why: "third place too far behind",
    rows: [...many(4, "food", { cents: 200 }), ...many(3, "groceries"), ...many(3, "coffee")],
  },
  { id: "home_barista", why: "two bean buys", rows: many(2, "coffee/beans") },
  { id: "carrots_doc", why: "three produce runs", rows: many(3, "groceries/produce") },
  { id: "frequent_flyer", why: "one flight", rows: [{ c: "transport/flight" }] },
  { id: "front_row", why: "one event", rows: [{ c: "fun/events" }] },
  { id: "big_tipper", why: "seven tips under a bigger lead", rows: [...many(7, "tips"), BIG_RENT] },
  { id: "santas_intern", why: "three gifts in November", key: "2026-11", rows: many(3, "gifts") },
  { id: "santas_intern", why: "two gifts in December", key: DEC, rows: many(2, "gifts") },
  { id: "summer_getaway", why: "a July of plain groceries", key: JUL, rows: many(3, "groceries") },
  { id: "summer_getaway", why: "a September flight", rows: [{ c: "transport/flight" }] },
  // --- notable ---
  {
    id: "globetrotter",
    why: "three currencies: that's a Passport",
    rows: ["USD", "EUR", "LBP"].map((cur) => ({ c: "food", cur })),
  },
  { id: "fortnight_flame", why: "21 days: that's Three-Week", rows: everyDay(21) },
  { id: "fortnight_flame", why: "13 days", rows: everyDay(13) },
  { id: "seven_straight", why: "14 days: that's a Fortnight", rows: everyDay(14) },
  { id: "seven_straight", why: "6 days", rows: everyDay(6) },
  { id: "weekend_wabbit", why: "seven entries, all weekend", rows: many(7, "food", { days: WEEKEND }) },
  { id: "nine_to_fiver", why: "14 weekday entries", rows: many(14, "food", { days: WEEKDAYS }) },
  { id: "after_hours", why: "seven entries at 23:00", rows: many(7, "food", { h: 23 }) },
  { id: "early_bird", why: "seven entries at 07:00", rows: many(7, "food", { h: 7 }) },
  {
    id: "main_character",
    why: "only two categories",
    rows: [...many(5, "food", { cents: 200 }), { c: "groceries" }],
  },
  {
    id: "main_character",
    why: "the lead has only four rows",
    rows: [...many(4, "food", { cents: 200 }), { c: "groceries" }, { c: "coffee" }],
  },
  { id: "one_big_hop", why: "seven entries", rows: [{ c: "food", cents: 10_000 }, ...many(6, "food")] },
  {
    id: "doorbell_diner",
    why: "food ranks third",
    rows: [...many(4, "food/delivery"), { c: "groceries", cents: 1000 }, { c: "coffee", cents: 1000 }],
  },
  { id: "reservation_held", why: "three restaurants", rows: many(3, "food/restaurant") },
  { id: "snack_attack", why: "four snacks", rows: many(4, "food/snacks") },
  { id: "cafe_regular", why: "five cafés", rows: many(5, "coffee/cafe") },
  { id: "bread_winner", why: "three bakery runs", rows: many(3, "groceries/bakery") },
  { id: "backseat_boss", why: "three taxis", rows: many(3, "transport/taxi") },
  {
    id: "pit_crew",
    why: "three upkeep rows among four taxis",
    rows: [...many(3, "transport/service"), ...many(4, "transport/taxi")],
  },
  { id: "pit_crew", why: "two upkeep rows", rows: many(2, "transport/service") },
  { id: "auto_renewed", why: "two subscriptions", rows: many(2, "fees/subscriptions") },
  { id: "wardrobe_update", why: "two clothes buys", rows: many(2, "shopping/clothes") },
  { id: "fresh_set", why: "one nail visit", rows: [{ c: "self_care/nails" }] },
  { id: "popcorn_patron", why: "two movies", rows: many(2, "fun/movies") },
  { id: "player_one", why: "two games", rows: many(2, "fun/games") },
  { id: "rep_machine", why: "gym leads with a single row", rows: [{ c: "gym" }] },
  { id: "gift_horse", why: "gifts lead in December", key: DEC, rows: many(2, "gifts") },
  { id: "gift_horse", why: "a single gift", rows: [{ c: "gifts" }] },
  { id: "cupids_courier", why: "two gifts in March", key: "2026-03", rows: many(2, "gifts") },
  { id: "spooky_season", why: "an October of groceries", key: OCT, rows: many(4, "groceries") },
  // --- everyday ---
  { id: "aisle_five_alive", why: "three groceries", rows: many(3, "groceries") },
  {
    id: "aisle_five_alive",
    why: "groceries lead with under 30%",
    rows: [
      ...many(4, "groceries"),
      ...many(3, "food", { cents: 130 }),
      ...many(3, "coffee", { cents: 130 }),
      ...many(3, "gas", { cents: 130 }),
    ],
  },
  { id: "aisle_five_alive", why: "four groceries under a bigger lead", rows: [...many(4, "groceries"), BIG_RENT] },
  { id: "thats_all_forks", why: "three food", rows: many(3, "food") },
  { id: "bean_counter", why: "coffee leads with three", rows: many(3, "coffee") },
  { id: "bean_counter", why: "eleven coffees under a bigger lead", rows: [...many(11, "coffee"), BIG_RENT] },
  { id: "tank_you", why: "two gas", rows: many(2, "gas") },
  { id: "spot_hunter", why: "parking leads with three", rows: many(3, "parking") },
  { id: "spot_hunter", why: "nine parkings under a bigger lead", rows: [...many(9, "parking"), BIG_RENT] },
  { id: "on_the_move", why: "three transport", rows: many(3, "transport") },
  { id: "bag_of_tricks", why: "two shopping", rows: many(2, "shopping") },
  { id: "glow_getter", why: "one self care", rows: [{ c: "self_care" }] },
  {
    id: "tune_up_month",
    why: "a hospital visit is in the month",
    rows: [...many(2, "health/doctor"), { c: "health/hospital" }],
  },
  { id: "tune_up_month", why: "one doctor visit", rows: [{ c: "health/doctor" }] },
  { id: "fine_print_reader", why: "two fees", rows: many(2, "fees") },
  { id: "homebody", why: "rent under a bigger lead", rows: [{ c: "rent" }, { c: "groceries", cents: 1000 }] },
  { id: "fun_committee", why: "two fun", rows: many(2, "fun") },
  { id: "business_casual", why: "two work", rows: many(2, "work") },
  { id: "burrow_boss", why: "one family", rows: [{ c: "family" }] },
  { id: "misc_maestro", why: "three other", rows: many(3, "other") },
];

describe("earnedTitles", () => {
  it("is empty for a month with no spending, whatever else was logged", () => {
    expect(earnedTitles(facts([]))).toEqual([]);
    // An income row logs its day but isn't spending: still no titles.
    const income = monthFacts(
      [tx({ is_income: true, category: "salary", occurred_at: new Date(2026, 8, 5, 12).toISOString() })],
      SEP,
      NOW,
    );
    expect(income.entries).toBe(0);
    expect(earnedTitles(income)).toEqual([]);
  });

  it.each(EARNS)("earns $id: $why", ({ id, rows, key, now }) => {
    expect(earnedIds(rows, key, now)).toContain(id);
  });

  it.each(DENIES)("withholds $id: $why", ({ id, rows, key, now }) => {
    expect(earnedIds(rows, key, now)).not.toContain(id);
  });

  it("returns titles without their rule attached", () => {
    for (const title of earnedTitles(facts([{ c: "rent" }]))) {
      expect(Object.keys(title).sort()).toEqual(["caption", "id", "tier", "title"]);
    }
  });

  it("has no lead category to compare against when the facts carry none", () => {
    // The type allows entries without categories; the lead falls back to ""
    // so lead-based rules stay quiet instead of throwing.
    const f = { ...facts(many(4, "groceries")), categories: [] };
    expect(ids(earnedTitles(f))).not.toContain("aisle_five_alive");
  });
});

describe("the catalogue", () => {
  // Every title the tables above earn, plus the fallbacks: with TITLE_COUNT
  // agreeing, the positive table is proven to reach every single title.
  const seen = new Map<string, RecapTitle>();
  for (const { rows, key, now } of EARNS) {
    for (const t of earnedTitles(facts(rows, key, now))) seen.set(t.id, t);
  }
  for (const t of FALLBACK_TITLES) seen.set(t.id, t);
  const all = [...seen.values()];

  it("is 57 titles plus 3 fallbacks, every one of them earned above", () => {
    expect(TITLE_COUNT).toBe(60);
    expect(all).toHaveLength(TITLE_COUNT);
    expect(FALLBACK_TITLES.map((t) => t.id)).toEqual(["first_hop", "month_well_logged", "in_the_binder"]);
  });

  it("writes every title in caps with a full stop, and keeps captions short", () => {
    for (const t of all) {
      expect(t.title).toBe(t.title.toUpperCase());
      expect(t.title.endsWith(".")).toBe(true);
      expect(t.caption.length).toBeLessThanOrEqual(70);
      expect(["everyday", "notable", "rare", "legendary"]).toContain(t.tier);
    }
  });
});

describe("eligibleTitles", () => {
  it("is only the three fallbacks for an empty month, never nothing", () => {
    expect(eligibleTitles(facts([]))).toEqual(FALLBACK_TITLES);
  });

  it("lists the earned titles best tier first, then the fallbacks", () => {
    // One rare, one notable, two everyday: bean_counter is earned by count,
    // not by leading, so two everyday titles can sit together.
    const rows = [
      { c: "gifts/donation" },
      ...many(4, "food/restaurant", { cents: 500, days: [24, 26, 28, 30] }),
      ...many(12, "coffee", { cents: 10, days: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23] }),
    ];
    expect(ids(eligibleTitles(facts(rows)))).toEqual([
      "good_egg",
      "reservation_held",
      "thats_all_forks",
      "bean_counter",
      "first_hop",
      "month_well_logged",
      "in_the_binder",
    ]);
  });
});

describe("monthSeed", () => {
  it("is the month's index in years times twelve, so it moves by one each month", () => {
    expect(monthSeed(facts([], SEP))).toBe(2026 * 12 + 8);
    expect(monthSeed(facts([], "2025-12"))).toBe(2025 * 12 + 11);
    expect(monthSeed(facts([], "2026-01"))).toBe(2025 * 12 + 12);
  });
});

describe("defaultTitle", () => {
  it("opens on a legendary and rotates among them by month, never rotating one away", () => {
    // Four rows on every day: 120-odd entries and full coverage, so both
    // FULL MOON and CENTURY CLUB are earned alongside a pile of lower tiers.
    const sep = facts(everyDay(30, 4), SEP);
    const aug = facts(everyDay(31, 4), AUG);
    expect(ids(earnedTitles(sep))).toEqual(expect.arrayContaining(["full_moon", "century_club"]));
    expect(earnedTitles(sep).length).toBeGreaterThan(2);
    // September's seed is even, August's odd.
    expect(defaultTitle(sep).id).toBe("full_moon");
    expect(defaultTitle(aug).id).toBe("century_club");
  });

  it("rotates over the best tier alone when it already holds three or more", () => {
    // Four rares (three currencies, two flights, two events, a donation)
    // plus ON THE MOVE: the everyday title never gets a turn.
    const rows: Spec[] = [
      { c: "transport/flight", cents: 300, cur: "USD" },
      { c: "transport/flight", cents: 300, cur: "EUR" },
      { c: "fun/events", cur: "LBP" },
      { c: "fun/events" },
      { c: "gifts/donation" },
      ...many(2, "transport/taxi"),
    ];
    expect(earnedIds(rows, "2026-01")).toEqual([
      "passport_stamped",
      "frequent_flyer",
      "front_row",
      "good_egg",
      "on_the_move",
    ]);
    // Four consecutive months walk the four rares in catalogue order.
    const picks = ["2026-01", "2026-02", "2026-03", "2026-04"].map(
      (key) => defaultTitle(facts(rows, key)).id,
    );
    expect(picks).toEqual(["passport_stamped", "frequent_flyer", "front_row", "good_egg"]);
  });

  it("tops the pool up from lower tiers until it holds three, then rotates by month", () => {
    // One rare and one notable aren't enough, so both everyday titles join
    // the pool: the same habits four months running open on four titles.
    const rows = [
      { c: "gifts/donation", d: 26 },
      ...many(4, "food/restaurant", { cents: 500, days: [24, 26, 28, 30] }),
      ...many(12, "coffee", { cents: 10, days: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23] }),
    ];
    const pool = ["good_egg", "reservation_held", "thats_all_forks", "bean_counter"];
    expect(earnedIds(rows)).toEqual(pool);
    const picks = [JUN, JUL, AUG, SEP].map((key) => defaultTitle(facts(rows, key)).id);
    expect(picks).toEqual(["reservation_held", "thats_all_forks", "bean_counter", "good_egg"]);
    for (const pick of picks) expect(pool).toContain(pick);
    expect(new Set(picks).size).toBe(4);
  });

  it("uses whatever is earned when the pool can't reach three", () => {
    const rows = [{ c: "rent" }];
    expect(earnedIds(rows)).toEqual(["homebody"]);
    expect(defaultTitle(facts(rows, SEP)).id).toBe("homebody");
    expect(defaultTitle(facts(rows, AUG)).id).toBe("homebody");
  });

  it("is FIRST HOP for a month of three entries or fewer that earns nothing", () => {
    expect(defaultTitle(facts([]))).toBe(FALLBACK_TITLES[0]);
    // Three categories, each under its lead minimum.
    const rows = [{ c: "groceries" }, { c: "food" }, { c: "coffee" }];
    expect(earnedIds(rows)).toEqual([]);
    expect(defaultTitle(facts(rows))).toBe(FALLBACK_TITLES[0]);
  });

  it("alternates the other two fallbacks by month for a fuller month that earns nothing", () => {
    // Five categories with one row each: every lead rule wants more.
    const rows = ["groceries", "food", "coffee", "gas", "parking"].map((c) => ({ c }));
    expect(earnedIds(rows)).toEqual([]);
    expect(defaultTitle(facts(rows, SEP)).id).toBe("month_well_logged");
    expect(defaultTitle(facts(rows, AUG)).id).toBe("in_the_binder");
    expect(defaultTitle(facts(rows, JUL)).id).toBe("month_well_logged");
  });
});

describe("nickname", () => {
  const plain = facts([]);

  it.each([
    ["groceries", "Cart charge"],
    ["food", "Fork lift"],
    ["coffee", "Espresso shot"],
    ["gas", "Full tank"],
    ["parking", "Spot claim"],
    ["transport", "Quick hop"],
    ["shopping", "Bag haul"],
    ["self_care", "Glow up"],
    ["gym", "Rep set"],
    ["health", "Check-up"],
    ["fees", "Fine print"],
    ["rent", "Home base"],
    ["fun", "Party trick"],
    ["gifts", "Gift wrap"],
    ["tips", "Coin toss"],
    ["work", "Power lunch"],
    ["family", "Group hug"],
    ["other", "Wild card"],
  ])("names %s %j when no subcategory dominates", (id, name) => {
    expect(nickname(plain, id)).toBe(name);
  });

  it.each([
    ["food/delivery", "Doorbell dash"],
    ["food/restaurant", "Table service"],
    ["food/fast_food", "Drive-thru"],
    ["food/snacks", "Snack attack"],
    ["coffee/cafe", "Café crawl"],
    ["coffee/beans", "Home brew"],
    ["groceries/bakery", "Fresh loaf"],
    ["groceries/produce", "Carrot top"],
    ["transport/taxi", "Backseat ride"],
    ["transport/flight", "Takeoff"],
    ["transport/bus", "Bus hop"],
    ["fees/subscriptions", "Auto-renew"],
    ["fees/mobile", "Signal boost"],
    ["fun/movies", "Popcorn time"],
    ["fun/games", "Extra life"],
    ["fun/events", "Front row"],
    ["shopping/clothes", "Fresh fit"],
    ["shopping/electronics", "Gadget grab"],
    ["self_care/nails", "Fresh set"],
    ["self_care/hair", "Fresh cut"],
    ["gifts/birthday", "Candle blow"],
    ["health/pharmacy", "Pharmacy run"],
  ])("sharpens to %j when that subcategory owns the category", (stored, name) => {
    const base = stored.split("/")[0];
    // Three of five rows is the 60% line, inclusive.
    const f = facts([...many(3, stored), ...many(2, base)]);
    expect(nickname(f, base)).toBe(name);
  });

  it("keeps the base name while no subcategory reaches 60%", () => {
    const split = facts([...many(2, "food/delivery"), ...many(2, "food/restaurant")]);
    expect(nickname(split, "food")).toBe("Fork lift");
    const nearly = facts([...many(2, "food/delivery"), ...many(2, "food")]);
    expect(nickname(nearly, "food")).toBe("Fork lift");
  });

  it("only looks at the category asked about", () => {
    const f = facts(many(3, "food/delivery"));
    expect(nickname(f, "groceries")).toBe("Cart charge");
  });

  it("is Wild card for a category it doesn't know", () => {
    expect(nickname(plain, "mystery")).toBe("Wild card");
    expect(nickname(plain, "")).toBe("Wild card");
  });
});

describe("HABITAT_LABEL", () => {
  it("has a label per habitat", () => {
    expect(HABITAT_LABEL).toEqual({
      weekends: "Weekends",
      weekdays: "Weekdays",
      night: "After dark",
      sunrise: "Sunrise",
      anytime: "Anytime",
    });
  });
});

describe("habitatOf", () => {
  it("is anytime under eight entries, however lopsided they are", () => {
    expect(habitatOf(facts(many(7, "food", { days: WEEKEND, h: 23 })))).toBe("anytime");
  });

  it("is weekends from 55% weekend entries, ahead of the hour", () => {
    const rows = [...many(5, "food", { days: WEEKEND, h: 23 }), ...many(3, "food", { days: WEEKDAYS })];
    expect(habitatOf(facts(rows))).toBe("weekends");
  });

  it("is weekdays only with fifteen entries and almost none on a weekend", () => {
    expect(habitatOf(facts(many(15, "food", { days: WEEKDAYS })))).toBe("weekdays");
    expect(habitatOf(facts(many(14, "food", { days: WEEKDAYS })))).toBe("anytime");
    const one = [...many(15, "food", { days: WEEKDAYS }), { c: "food", d: 12 }];
    expect(habitatOf(facts(one))).toBe("weekdays"); // 1 in 16 is under 10%
    const two = [...many(15, "food", { days: WEEKDAYS }), ...many(2, "food", { days: WEEKEND })];
    expect(habitatOf(facts(two))).toBe("anytime"); // 2 in 17 is over
  });

  it("is night from a quarter of entries after 10pm", () => {
    const rows = [...many(2, "food", { days: WEEKDAYS, h: 23 }), ...many(6, "food", { days: WEEKDAYS })];
    expect(habitatOf(facts(rows))).toBe("night");
  });

  it("is sunrise from 30% of entries before 9am, after night has had its say", () => {
    const rows = [...many(3, "food", { days: WEEKDAYS, h: 7 }), ...many(5, "food", { days: WEEKDAYS })];
    expect(habitatOf(facts(rows))).toBe("sunrise");
    const both = [
      ...many(3, "food", { days: WEEKDAYS, h: 7 }),
      ...many(2, "food", { days: WEEKDAYS, h: 4 }),
      ...many(3, "food", { days: WEEKDAYS }),
    ];
    expect(habitatOf(facts(both))).toBe("night");
  });

  it("is anytime when no pattern stands out", () => {
    const rows = [...many(2, "food", { days: WEEKDAYS, h: 7 }), ...many(6, "food", { days: WEEKDAYS })];
    expect(habitatOf(facts(rows))).toBe("anytime");
  });
});

describe("revealLine", () => {
  it("leads with the late-night share when it's 30% or more", () => {
    const rows = [...many(3, "food", { days: WEEKEND, h: 23 }), ...many(5, "food", { days: WEEKEND })];
    // Every entry is on a weekend too, but the night comes first.
    expect(revealLine(facts(rows))).toBe("38% of my entries happened after 10pm.");
  });

  it("then the weekend share, in entries per ten", () => {
    const rows = [...many(5, "food", { days: WEEKEND }), ...many(3, "food", { days: WEEKDAYS, h: 7 })];
    expect(revealLine(facts(rows))).toBe("6 of every 10 entries landed on a weekend.");
  });

  it("then the early share, as one in so many", () => {
    const rows = [...many(3, "food", { days: WEEKDAYS, h: 7 }), ...many(5, "food", { days: WEEKDAYS })];
    expect(revealLine(facts(rows))).toBe("1 in 3 entries were logged before 9am.");
  });

  it("skips the pattern lines under eight entries, however strong the pattern", () => {
    const rows = [...many(7, "food", { d: 12, h: 23 })];
    expect(revealLine(facts(rows))).toBe("1 of 30 days logged.");
  });

  it("holds the pattern lines to a higher bar than the titles do", () => {
    // 25% late is AFTER HOURS, but the line wants 30%; likewise 30% early is
    // EARLY BIRD, but the line wants 35%.
    const late = [
      ...many(2, "food", { days: WEEKDAYS, h: 23 }),
      ...many(6, "food", { days: WEEKDAYS, cur: "EUR" }),
    ];
    expect(earnedIds(late)).toContain("after_hours");
    expect(revealLine(facts(late))).toBe("Logged in 2 currencies.");
    const early = [...many(3, "food", { days: WEEKDAYS, h: 7 }), ...many(7, "food", { days: WEEKDAYS })];
    expect(earnedIds(early)).toContain("early_bird");
    expect(revealLine(facts(early))).toBe("5 of 30 days logged.");
  });

  it("then how many categories got a visit, from ten up", () => {
    const rows = [...TWELVE.slice(0, 10).map((c) => ({ c })), { c: "gym", cur: "EUR" }];
    expect(revealLine(facts(rows))).toBe("10 of 18 categories got a visit.");
  });

  it("then the currency count, from two up", () => {
    const rows = [...everyDay(7), { c: "food", cur: "EUR", d: 7 }];
    expect(revealLine(facts(rows))).toBe("Logged in 2 currencies.");
  });

  it("then the longest streak, from a week up", () => {
    expect(revealLine(facts(everyDay(7)))).toBe("Longest streak: 7 days in a row.");
    expect(revealLine(facts(everyDay(6)))).toBe("6 of 30 days logged.");
  });

  it("falls back to days logged out of days in the month", () => {
    const rows = [{ c: "food", d: 1 }, { c: "food", d: 3 }, { c: "food", d: 5 }];
    expect(revealLine(facts(rows))).toBe("3 of 30 days logged.");
    expect(revealLine(facts([], FEB))).toBe("0 of 28 days logged.");
  });
});
