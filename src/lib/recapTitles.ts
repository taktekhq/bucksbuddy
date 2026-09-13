// The Recap's words: the title catalogue a month can earn, the rule that
// picks which one it opens with, a nickname per category, and the habitat
// and reveal line the drawings use. Everything is a pure function of the
// month's facts and its key — no history, no device state — so the same
// month names itself the same way on every phone.
//
// Titles are playful labels for what got logged, never verdicts on the
// person: nothing here says "too much", compares to anyone, or mentions
// money. Pattern titles need a minimum of entries so one Saturday coffee
// can't become "WEEKEND WABBIT".
import {
  coverage,
  entriesOf,
  rankOf,
  shareOf,
  subEntriesOf,
  subShare,
  type MonthFacts,
} from "@/lib/recap";

export type TitleTier = "everyday" | "notable" | "rare" | "legendary";

export type RecapTitle = {
  id: string;
  title: string; // ALL CAPS, ends with a period
  caption: string; // the flavor line
  tier: TitleTier;
};

type Rule = (f: MonthFacts) => boolean;
type Entry = RecapTitle & { when: Rule };

const lead = (f: MonthFacts) => f.categories[0]?.id ?? "";
const month = (f: MonthFacts) => f.month.getMonth() + 1;
const top2 = (f: MonthFacts, id: string) => rankOf(f, id) > 0 && rankOf(f, id) <= 2;
const logged = (f: MonthFacts, day: number) => f.loggedDays.includes(day);
// A health month never headlines while a hospital visit is in it.
const healthOk = (f: MonthFacts) => subEntriesOf(f, "health", "hospital") === 0;
const carUpkeep = (f: MonthFacts) =>
  ["service", "repairs", "wash", "insurance", "registration"].reduce(
    (sum, sub) => sum + subEntriesOf(f, "transport", sub),
    0,
  );

// In catalogue order: the order the picker shows and the pool rotates over.
const CATALOGUE: Entry[] = [
  // --- legendary ---
  {
    id: "full_moon",
    title: "FULL MOON.",
    caption: "Every single day. Not one got away, Doc.",
    tier: "legendary",
    when: (f) => coverage(f) === 1 && f.daysAvailable >= 7,
  },
  {
    id: "century_club",
    title: "CENTURY CLUB.",
    caption: "One hundred logs. Not a typo, Doc.",
    tier: "legendary",
    when: (f) => f.entries >= 100,
  },
  {
    id: "leap_day_logger",
    title: "LEAP DAY LOGGER.",
    caption: "A card you can only pull every four years.",
    tier: "legendary",
    when: (f) => month(f) === 2 && logged(f, 29),
  },
  // --- rare ---
  {
    id: "passport_stamped",
    title: "PASSPORT STAMPED.",
    caption: "Three currencies. One well-travelled wabbit.",
    tier: "rare",
    when: (f) => f.currencies >= 3,
  },
  {
    id: "clockwork",
    title: "CLOCKWORK.",
    caption: "Logged like a Swiss watch with ears.",
    tier: "rare",
    when: (f) => coverage(f) >= 0.8 && coverage(f) < 1,
  },
  {
    id: "three_week_streak",
    title: "THREE-WEEK STREAK.",
    caption: "Twenty-one days straight. Gold flame.",
    tier: "rare",
    when: (f) => f.streak >= 21 && coverage(f) < 1,
  },
  {
    id: "half_century",
    title: "HALF CENTURY.",
    caption: "Fifty logs and still hopping.",
    tier: "rare",
    when: (f) => f.entries >= 50 && f.entries < 100,
  },
  {
    id: "full_spectrum",
    title: "FULL SPECTRUM.",
    caption: "Every color in the crayon box got used.",
    tier: "rare",
    when: (f) => f.categories.length >= 12,
  },
  {
    id: "triple_threat",
    title: "TRIPLE THREAT.",
    caption: "Three categories. Dead heat. No winner.",
    tier: "rare",
    when: (f) =>
      f.entries >= 10 &&
      f.categories.length >= 3 &&
      f.categories[2].share >= 0.15 &&
      f.categories[0].share - f.categories[2].share <= 0.05,
  },
  {
    id: "home_barista",
    title: "HOME BARISTA.",
    caption: "Grinds at home. Logs at home.",
    tier: "rare",
    when: (f) => subShare(f, "coffee", "beans") >= 0.5 && entriesOf(f, "coffee") >= 3,
  },
  {
    id: "carrots_doc",
    title: "CARROTS, DOC.",
    caption: "Produce aisle regular. The mascot approves.",
    tier: "rare",
    when: (f) => subShare(f, "groceries", "produce") >= 0.5 && entriesOf(f, "groceries") >= 4,
  },
  {
    id: "frequent_flyer",
    title: "FREQUENT FLYER.",
    caption: "Tray tables up. Entries logged.",
    tier: "rare",
    when: (f) => subEntriesOf(f, "transport", "flight") >= 2,
  },
  {
    id: "front_row",
    title: "FRONT ROW.",
    caption: "Tickets scanned. Memories logged.",
    tier: "rare",
    when: (f) => subEntriesOf(f, "fun", "events") >= 2,
  },
  {
    id: "good_egg",
    title: "GOOD EGG.",
    caption: "Gave a little. Meant a lot.",
    tier: "rare",
    when: (f) => subEntriesOf(f, "gifts", "donation") >= 1,
  },
  {
    id: "big_tipper",
    title: "BIG TIPPER.",
    caption: "Servers everywhere say thanks, Doc.",
    tier: "rare",
    when: (f) => lead(f) === "tips" || entriesOf(f, "tips") >= 8,
  },
  {
    id: "santas_intern",
    title: "SANTA'S INTERN.",
    caption: "The sleigh needed a bookkeeper.",
    tier: "rare",
    when: (f) => month(f) === 12 && entriesOf(f, "gifts") >= 3,
  },
  {
    id: "summer_getaway",
    title: "SUMMER GETAWAY.",
    caption: "Out of office. Still logging.",
    tier: "rare",
    when: (f) =>
      month(f) >= 6 &&
      month(f) <= 8 &&
      (subEntriesOf(f, "transport", "flight") >= 1 ||
        subEntriesOf(f, "rent", "airbnb") >= 1 ||
        f.currencies >= 2),
  },
  // --- notable ---
  {
    id: "globetrotter",
    title: "GLOBETROTTER.",
    caption: "Two currencies, one card. Customs cleared.",
    tier: "notable",
    when: (f) => f.currencies === 2,
  },
  {
    id: "fortnight_flame",
    title: "FORTNIGHT FLAME.",
    caption: "Two weeks without missing a day.",
    tier: "notable",
    when: (f) => f.streak >= 14 && f.streak < 21,
  },
  {
    id: "seven_straight",
    title: "SEVEN STRAIGHT.",
    caption: "A whole week, back to back. Bronze flame.",
    tier: "notable",
    when: (f) => f.streak >= 7 && f.streak < 14,
  },
  {
    id: "weekend_wabbit",
    title: "WEEKEND WABBIT.",
    caption: "Saturday and Sunday did the heavy lifting.",
    tier: "notable",
    when: (f) => f.weekendShare >= 0.55 && f.entries >= 8,
  },
  {
    id: "nine_to_fiver",
    title: "NINE-TO-FIVER.",
    caption: "Clocks in, logs out.",
    tier: "notable",
    when: (f) => f.weekendShare <= 0.1 && f.entries >= 15,
  },
  {
    id: "after_hours",
    title: "AFTER HOURS.",
    caption: "The moon saw most of it.",
    tier: "notable",
    when: (f) => f.lateNightShare >= 0.25 && f.entries >= 8,
  },
  {
    id: "early_bird",
    title: "EARLY BIRD.",
    caption: "Up before the worm. Logged before coffee.",
    tier: "notable",
    when: (f) => f.earlyShare >= 0.3 && f.entries >= 8,
  },
  {
    id: "main_character",
    title: "MAIN CHARACTER.",
    caption: "One category ran the whole show.",
    tier: "notable",
    when: (f) =>
      shareOf(f, lead(f)) >= 0.6 && f.categories.length >= 3 && entriesOf(f, lead(f)) >= 5,
  },
  {
    id: "one_big_hop",
    title: "ONE BIG HOP.",
    caption: "One entry did half the lifting.",
    tier: "notable",
    when: (f) => f.biggestEntryShare >= 0.5 && f.entries >= 8,
  },
  {
    id: "doorbell_diner",
    title: "DOORBELL DINER.",
    caption: "The doorbell is the dinner bell.",
    tier: "notable",
    when: (f) =>
      top2(f, "food") && subShare(f, "food", "delivery") >= 0.6 && entriesOf(f, "food") >= 4,
  },
  {
    id: "reservation_held",
    title: "RESERVATION HELD.",
    caption: "Menu read. Order logged. Chef's kiss.",
    tier: "notable",
    when: (f) =>
      top2(f, "food") && subShare(f, "food", "restaurant") >= 0.6 && entriesOf(f, "food") >= 4,
  },
  {
    id: "snack_attack",
    title: "SNACK ATTACK.",
    caption: "Small bites. Big card.",
    tier: "notable",
    when: (f) => subShare(f, "food", "snacks") >= 0.5 && entriesOf(f, "food") >= 5,
  },
  {
    id: "cafe_regular",
    title: "CAFE REGULAR.",
    caption: "They start the order when you walk in.",
    tier: "notable",
    when: (f) =>
      top2(f, "coffee") && subShare(f, "coffee", "cafe") >= 0.7 && entriesOf(f, "coffee") >= 6,
  },
  {
    id: "bread_winner",
    title: "BREAD WINNER.",
    caption: "Fresh from the oven, straight to the card.",
    tier: "notable",
    when: (f) => subShare(f, "groceries", "bakery") >= 0.5 && entriesOf(f, "groceries") >= 4,
  },
  {
    id: "backseat_boss",
    title: "BACKSEAT BOSS.",
    caption: "Route approved from the back seat.",
    tier: "notable",
    when: (f) =>
      top2(f, "transport") &&
      subShare(f, "transport", "taxi") >= 0.6 &&
      entriesOf(f, "transport") >= 4,
  },
  {
    id: "pit_crew",
    title: "PIT CREW.",
    caption: "The car's fine. The car is always fine.",
    tier: "notable",
    when: (f) => carUpkeep(f) >= 3 && carUpkeep(f) / entriesOf(f, "transport") >= 0.5,
  },
  {
    id: "auto_renewed",
    title: "AUTO-RENEWED.",
    caption: "Subscribed to being subscribed.",
    tier: "notable",
    when: (f) =>
      top2(f, "fees") && subShare(f, "fees", "subscriptions") >= 0.6 && entriesOf(f, "fees") >= 3,
  },
  {
    id: "wardrobe_update",
    title: "WARDROBE UPDATE.",
    caption: "New fit. Same wabbit.",
    tier: "notable",
    when: (f) => subShare(f, "shopping", "clothes") >= 0.6 && entriesOf(f, "shopping") >= 3,
  },
  {
    id: "fresh_set",
    title: "FRESH SET.",
    caption: "Nails done. Card done.",
    tier: "notable",
    when: (f) => subShare(f, "self_care", "nails") >= 0.5 && entriesOf(f, "self_care") >= 2,
  },
  {
    id: "popcorn_patron",
    title: "POPCORN PATRON.",
    caption: "Front row. Extra butter. Logged.",
    tier: "notable",
    when: (f) => subShare(f, "fun", "movies") >= 0.5 && entriesOf(f, "fun") >= 3,
  },
  {
    id: "player_one",
    title: "PLAYER ONE.",
    caption: "Press start. Log entry.",
    tier: "notable",
    when: (f) => subShare(f, "fun", "games") >= 0.5 && entriesOf(f, "fun") >= 3,
  },
  {
    id: "rep_machine",
    title: "REP MACHINE.",
    caption: "Logs sets. Logs reps. Logs the log.",
    tier: "notable",
    when: (f) => (lead(f) === "gym" && entriesOf(f, "gym") >= 2) || entriesOf(f, "gym") >= 8,
  },
  {
    id: "gift_horse",
    title: "GIFT HORSE.",
    caption: "Don't look it in the mouth. Look at the card.",
    tier: "notable",
    when: (f) =>
      lead(f) === "gifts" && shareOf(f, "gifts") >= 0.3 && entriesOf(f, "gifts") >= 2 && month(f) !== 12,
  },
  {
    id: "cupids_courier",
    title: "CUPID'S COURIER.",
    caption: "Deliveries made. Hearts logged.",
    tier: "notable",
    when: (f) => month(f) === 2 && entriesOf(f, "gifts") >= 2,
  },
  {
    id: "spooky_season",
    title: "SPOOKY SEASON.",
    caption: "Trick, treat, and a tidy log.",
    tier: "notable",
    when: (f) =>
      month(f) === 10 && (shareOf(f, "fun") >= 0.25 || subEntriesOf(f, "food", "snacks") >= 4),
  },
  // --- everyday: one per leading category ---
  {
    id: "aisle_five_alive",
    title: "AISLE FIVE ALIVE.",
    caption: "Pushing a cart like it's a chariot.",
    tier: "everyday",
    when: (f) =>
      lead(f) === "groceries" && shareOf(f, "groceries") >= 0.3 && entriesOf(f, "groceries") >= 4,
  },
  {
    id: "thats_all_forks",
    title: "THAT'S ALL, FORKS.",
    caption: "Fork it over, Doc. Every plate got logged.",
    tier: "everyday",
    when: (f) => lead(f) === "food" && shareOf(f, "food") >= 0.3 && entriesOf(f, "food") >= 4,
  },
  {
    id: "bean_counter",
    title: "BEAN COUNTER.",
    caption: "Finally, a bean counter who counts beans.",
    tier: "everyday",
    when: (f) =>
      (lead(f) === "coffee" && entriesOf(f, "coffee") >= 4) || entriesOf(f, "coffee") >= 12,
  },
  {
    id: "tank_you",
    title: "TANK YOU VERY MUCH.",
    caption: "Fill 'er up, Doc. Miles ahead.",
    tier: "everyday",
    when: (f) => lead(f) === "gas" && shareOf(f, "gas") >= 0.3 && entriesOf(f, "gas") >= 3,
  },
  {
    id: "spot_hunter",
    title: "SPOT HUNTER.",
    caption: "Sees a free spot from three blocks away.",
    tier: "everyday",
    when: (f) =>
      (lead(f) === "parking" && entriesOf(f, "parking") >= 4) || entriesOf(f, "parking") >= 10,
  },
  {
    id: "on_the_move",
    title: "ON THE MOVE.",
    caption: "Never in the same place twice.",
    tier: "everyday",
    when: (f) =>
      lead(f) === "transport" && shareOf(f, "transport") >= 0.3 && entriesOf(f, "transport") >= 4,
  },
  {
    id: "bag_of_tricks",
    title: "BAG OF TRICKS.",
    caption: "Paper or plastic? Yes.",
    tier: "everyday",
    when: (f) =>
      lead(f) === "shopping" && shareOf(f, "shopping") >= 0.3 && entriesOf(f, "shopping") >= 3,
  },
  {
    id: "glow_getter",
    title: "GLOW GETTER.",
    caption: "Shiny on the outside, shiny on the card.",
    tier: "everyday",
    when: (f) =>
      lead(f) === "self_care" && shareOf(f, "self_care") >= 0.25 && entriesOf(f, "self_care") >= 2,
  },
  {
    id: "tune_up_month",
    title: "TUNE-UP MONTH.",
    caption: "A little maintenance goes a long way.",
    tier: "everyday",
    when: (f) =>
      lead(f) === "health" && shareOf(f, "health") >= 0.3 && entriesOf(f, "health") >= 2 && healthOk(f),
  },
  {
    id: "fine_print_reader",
    title: "FINE PRINT READER.",
    caption: "Reads the terms. All of them.",
    tier: "everyday",
    when: (f) => lead(f) === "fees" && shareOf(f, "fees") >= 0.3 && entriesOf(f, "fees") >= 3,
  },
  {
    id: "homebody",
    title: "HOMEBODY.",
    caption: "Roof: secured. Card: earned.",
    tier: "everyday",
    when: (f) => lead(f) === "rent" && shareOf(f, "rent") >= 0.3,
  },
  {
    id: "fun_committee",
    title: "FUN COMMITTEE.",
    caption: "Chair, treasurer, and sole member.",
    tier: "everyday",
    when: (f) => lead(f) === "fun" && shareOf(f, "fun") >= 0.3 && entriesOf(f, "fun") >= 3,
  },
  {
    id: "business_casual",
    title: "BUSINESS CASUAL.",
    caption: "Expense report? Already logged.",
    tier: "everyday",
    when: (f) => lead(f) === "work" && shareOf(f, "work") >= 0.3 && entriesOf(f, "work") >= 3,
  },
  {
    id: "burrow_boss",
    title: "BURROW BOSS.",
    caption: "The whole burrow made the card.",
    tier: "everyday",
    when: (f) => lead(f) === "family" && shareOf(f, "family") >= 0.3 && entriesOf(f, "family") >= 2,
  },
  {
    id: "misc_maestro",
    title: "MISC. MAESTRO.",
    caption: "Category: yes.",
    tier: "everyday",
    when: (f) => lead(f) === "other" && shareOf(f, "other") >= 0.3 && entriesOf(f, "other") >= 4,
  },
];

// Always available, so a month is never without a name. FIRST HOP is the
// default only for a month of a few entries; the other two take turns.
export const FALLBACK_TITLES: RecapTitle[] = [
  {
    id: "first_hop",
    title: "FIRST HOP.",
    caption: "Every collection starts with one card.",
    tier: "everyday",
  },
  {
    id: "month_well_logged",
    title: "MONTH, WELL LOGGED.",
    caption: "Nothing flashy. Everything counted.",
    tier: "everyday",
  },
  {
    id: "in_the_binder",
    title: "IN THE BINDER.",
    caption: "Filed. On to the next one.",
    tier: "everyday",
  },
];

export const TITLE_COUNT = CATALOGUE.length + FALLBACK_TITLES.length;

const TIER_RANK: Record<TitleTier, number> = { legendary: 3, rare: 2, notable: 1, everyday: 0 };
const TIERS: TitleTier[] = ["legendary", "rare", "notable", "everyday"];

// The titles without their rules, built once so a title keeps one identity
// across renders (the screen memoizes on it).
const TITLES: RecapTitle[] = CATALOGUE.map(({ when: _when, ...title }) => title);

/** The catalogue titles a month has earned, in catalogue order. */
export function earnedTitles(facts: MonthFacts): RecapTitle[] {
  if (facts.entries === 0) return [];
  return TITLES.filter((_t, i) => CATALOGUE[i].when(facts));
}

/**
 * Everything the picker offers: the earned titles best-tier first (catalogue
 * order within a tier), then the three fallbacks. Never empty.
 */
export function eligibleTitles(facts: MonthFacts): RecapTitle[] {
  const earned = earnedTitles(facts).sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  return [...earned, ...FALLBACK_TITLES];
}

/** A number that moves by one each month, so a rotation never repeats twice running. */
export function monthSeed(facts: MonthFacts): number {
  return facts.month.getFullYear() * 12 + facts.month.getMonth();
}

/**
 * The title a month opens with. A Legendary is never rotated away; below
 * that, the pool is the best tier earned, topped up from the next tiers
 * until it holds three, and the month's seed picks from it — so the same
 * habits two months running open on different titles. A month with nothing
 * earned gets a fallback: FIRST HOP for a handful of entries, otherwise the
 * other two take turns.
 */
export function defaultTitle(facts: MonthFacts): RecapTitle {
  const earned = earnedTitles(facts);
  const seed = monthSeed(facts);
  const legendary = earned.filter((t) => t.tier === "legendary");
  if (legendary.length > 0) return legendary[seed % legendary.length];
  const pool: RecapTitle[] = [];
  for (const tier of TIERS) {
    if (pool.length >= 3) break;
    pool.push(...earned.filter((t) => t.tier === tier));
  }
  if (pool.length > 0) return pool[seed % pool.length];
  if (facts.entries <= 3) return FALLBACK_TITLES[0];
  return FALLBACK_TITLES[1 + (seed % 2)];
}

// --- Nicknames --------------------------------------------------------------

// A playful nickname per category, sharper when one subcategory owns most
// of its rows. Small print under a category's row, never a headline.
const NICKNAMES: Record<string, string> = {
  groceries: "Cart charge",
  food: "Fork lift",
  coffee: "Espresso shot",
  gas: "Full tank",
  parking: "Spot claim",
  transport: "Quick hop",
  shopping: "Bag haul",
  self_care: "Glow up",
  gym: "Rep set",
  health: "Check-up",
  fees: "Fine print",
  rent: "Home base",
  fun: "Party trick",
  gifts: "Gift wrap",
  tips: "Coin toss",
  work: "Power lunch",
  family: "Group hug",
  other: "Wild card",
};

const SUB_NICKNAMES: Record<string, string> = {
  "food/delivery": "Doorbell dash",
  "food/restaurant": "Table service",
  "food/fast_food": "Drive-thru",
  "food/snacks": "Snack attack",
  "coffee/cafe": "Café crawl",
  "coffee/beans": "Home brew",
  "groceries/bakery": "Fresh loaf",
  "groceries/produce": "Carrot top",
  "transport/taxi": "Backseat ride",
  "transport/flight": "Takeoff",
  "transport/bus": "Bus hop",
  "fees/subscriptions": "Auto-renew",
  "fees/mobile": "Signal boost",
  "fun/movies": "Popcorn time",
  "fun/games": "Extra life",
  "fun/events": "Front row",
  "shopping/clothes": "Fresh fit",
  "shopping/electronics": "Gadget grab",
  "self_care/nails": "Fresh set",
  "self_care/hair": "Fresh cut",
  "gifts/birthday": "Candle blow",
  "health/pharmacy": "Pharmacy run",
};

/** A subcategory that owns at least this much of its parent names the nickname. */
const DOMINANT = 0.6;

export function nickname(facts: MonthFacts, id: string): string {
  for (const key of Object.keys(SUB_NICKNAMES)) {
    const [base, sub] = key.split("/");
    if (base === id && subShare(facts, base, sub) >= DOMINANT) return SUB_NICKNAMES[key];
  }
  return NICKNAMES[id] ?? NICKNAMES.other;
}

// --- Habitat ----------------------------------------------------------------

export type Habitat = "weekends" | "weekdays" | "night" | "sunrise" | "anytime";

export const HABITAT_LABEL: Record<Habitat, string> = {
  weekends: "Weekends",
  weekdays: "Weekdays",
  night: "After dark",
  sunrise: "Sunrise",
  anytime: "Anytime",
};

/** When the month's logging happened, as a habitat — needs enough entries to mean anything. */
export function habitatOf(f: MonthFacts): Habitat {
  if (f.entries < 8) return "anytime";
  if (f.weekendShare >= 0.55) return "weekends";
  if (f.weekendShare <= 0.1 && f.entries >= 15) return "weekdays";
  if (f.lateNightShare >= 0.25) return "night";
  if (f.earlyShare >= 0.3) return "sunrise";
  return "anytime";
}

// --- The reveal line --------------------------------------------------------

/** One surprising, true sentence about the month — the first fact that clears its bar. */
export function revealLine(f: MonthFacts): string {
  const pattern = f.entries >= 8;
  if (pattern && f.lateNightShare >= 0.3) {
    return `${Math.round(f.lateNightShare * 100)}% of my entries happened after 10pm.`;
  }
  if (pattern && f.weekendShare >= 0.55) {
    return `${Math.round(f.weekendShare * 10)} of every 10 entries landed on a weekend.`;
  }
  if (pattern && f.earlyShare >= 0.35) {
    return `1 in ${Math.round(1 / f.earlyShare)} entries were logged before 9am.`;
  }
  if (f.categories.length >= 10) return `${f.categories.length} of 18 categories got a visit.`;
  if (f.currencies >= 2) return `Logged in ${f.currencies} currencies.`;
  if (f.streak >= 7) return `Longest streak: ${f.streak} days in a row.`;
  return `${f.daysLogged} of ${f.daysInMonth} days logged.`;
}
