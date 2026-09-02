// Golden-fixture (characterization) test — see corpus.ts and
// docs/EXPO_MIGRATION.md, Validator #3.
//
// This does not test correctness (the hand-written *.test.ts files next to
// each module do that). It freezes the *current* output of every pure core
// function, run over a large synthetic corpus, as checked-in JSON. Its only
// job during the Expo port is to fail loudly the moment a port changes a
// number — intentionally or not — so a silent behavioural drift becomes a
// visible diff in golden.json instead of a support message from a user whose
// balance moved.
//
// To regenerate after a deliberate behaviour change:
//   UPDATE_GOLDEN=1 npx vitest run src/lib/__fixtures__/golden.test.ts
// then read the diff in golden.json as carefully as you would a schema
// migration — every changed number is a claim that the old number was wrong.
import { describe, expect, it } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  BOUNDARY_CATEGORY_IDS,
  BOUNDARY_DISPLAY_STRINGS,
  BOUNDARY_GRAMS,
  BOUNDARY_LBP_AMOUNTS,
  BOUNDARY_RATES,
  BOUNDARY_USD_AMOUNTS,
  REFERENCE_DATES,
  generateGoldEntries,
  generateTransactions,
} from "@/lib/__fixtures__/corpus";
import { toUsdCents, parseAmountString } from "@/lib/currency";
import {
  amountColorClass,
  formatSignedUsdCents,
  formatUsdCents,
  netCents,
  netColorClass,
} from "@/lib/money";
import { formatGrams } from "@/lib/gold";
import {
  currentMonthRange,
  dayKey,
  dayLabel,
  isToday,
  monthAnchor,
  monthLabel,
} from "@/lib/dates";
import {
  categoryColor,
  categoryLabel,
  categorySubLabel,
  composeCategory,
  splitCategory,
  subcategoryLabel,
} from "@/lib/categories";
import { transactionsToCsv } from "@/lib/csv";
import { groupByCategory, groupByDay } from "@/lib/history";
import {
  dailySpendSeries,
  isSpending,
  monthInsights,
  monthSpendSeries,
  monthlySpendTotals,
  topCategories,
  treatTransactions,
  weekendTransactions,
} from "@/lib/stats";
import type { Transaction } from "@/types/db";

// Resolved relative to the repo root, which is vitest's working directory
// (see vitest.config.ts) — import.meta.url isn't reliably a file:// URL under
// vitest's transform pipeline.
const GOLDEN_PATH = join(process.cwd(), "src/lib/__fixtures__/golden.json");

const TRANSACTIONS = generateTransactions();
const GOLD_ENTRIES = generateGoldEntries();

function mapDates<T>(fn: (now: Date) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [label, now] of Object.entries(REFERENCE_DATES)) {
    out[label] = fn(new Date(now));
  }
  return out;
}

function digestGroupByCategory() {
  return groupByCategory(TRANSACTIONS).map((g) => ({
    key: g.key,
    category: g.category,
    isIncome: g.isIncome,
    count: g.count,
    totalCents: g.totalCents,
    masked: g.masked,
    latestAt: g.latestAt,
  }));
}

function digestGroupByDay(now: Date) {
  return groupByDay(TRANSACTIONS, now).map((d) => ({
    key: d.key,
    label: d.label,
    totalCents: d.totalCents,
    masked: d.masked,
    groups: d.groups.map((g) => ({
      key: g.key,
      category: g.category,
      isIncome: g.isIncome,
      count: g.count,
      totalCents: g.totalCents,
      masked: g.masked,
      latestAt: g.latestAt,
    })),
  }));
}

// A tiny, hand-anchored fixture (not the big corpus) purely for the
// "Today"/"Yesterday" label wording, which depends on how far occurred_at
// sits from `now` rather than on anything the big corpus's random spread
// would reliably hit.
function recencyRows(now: Date): Transaction[] {
  const today = new Date(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9);
  const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 9);
  const base = {
    user_id: "recency-user",
    is_income: false,
    category: "coffee",
    amount_usd_cents: 100,
    original_currency: "USD" as const,
    original_amount: 1,
    rate_used: 89_500,
    note: null,
  };
  return [
    { ...base, id: "r-today", occurred_at: today.toISOString(), created_at: today.toISOString() },
    { ...base, id: "r-yesterday", occurred_at: yesterday.toISOString(), created_at: yesterday.toISOString() },
    { ...base, id: "r-2d", occurred_at: twoDaysAgo.toISOString(), created_at: twoDaysAgo.toISOString() },
  ];
}

function computeResults() {
  return {
    meta: {
      transactionCount: TRANSACTIONS.length,
      goldEntryCount: GOLD_ENTRIES.length,
      transactionIdsSample: TRANSACTIONS.slice(0, 3).map((t) => t.id),
    },

    currency: {
      toUsdCentsUsd: BOUNDARY_USD_AMOUNTS.map((a) => toUsdCents(a, "USD", 89_500)),
      toUsdCentsLbp: BOUNDARY_LBP_AMOUNTS.flatMap((a) =>
        BOUNDARY_RATES.map((r) => toUsdCents(a, "LBP", r)),
      ),
      parseAmountString: BOUNDARY_DISPLAY_STRINGS.map((s) => parseAmountString(s)),
    },

    money: {
      formatUsdCents: BOUNDARY_USD_AMOUNTS.filter(Number.isFinite).map((a) =>
        formatUsdCents(Math.round(a * 100)),
      ),
      formatSignedUsdCents: [-12345, -1, 0, 1, 12345].map((c) => formatSignedUsdCents(c)),
      netColorClass: [-1, 0, 1].map((c) => netColorClass(c)),
      amountColorClass: [true, false].map((b) => amountColorClass(b)),
      netCentsFullCorpus: netCents(TRANSACTIONS),
    },

    gold: {
      formatGrams: BOUNDARY_GRAMS.map((g) => formatGrams(g)),
    },

    dates: {
      monthLabel: mapDates((now) => monthLabel(now)),
      currentMonthRange: mapDates((now) => {
        const { from, to } = currentMonthRange(now);
        return { from: from.toISOString(), to: to.toISOString() };
      }),
      monthAnchor: mapDates((now) => ({
        current: monthAnchor(0, now).toISOString(),
        past: monthAnchor(-1, now).toISOString(),
        future: monthAnchor(1, now).toISOString(),
      })),
      isToday: mapDates((now) => ({
        sameInstant: isToday(now.toISOString(), now),
        yesterday: isToday(
          new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12).toISOString(),
          now,
        ),
      })),
      dayKeyAndLabel: mapDates((now) => ({
        dayKey: dayKey(now.toISOString()),
        dayLabel: dayLabel(now.toISOString(), now),
      })),
    },

    categories: {
      splitCategory: BOUNDARY_CATEGORY_IDS.map((id) => splitCategory(id)),
      composeCategory: [
        composeCategory("groceries", null),
        composeCategory("groceries", "supermarket"),
        composeCategory("", ""),
      ],
      categoryLabel: BOUNDARY_CATEGORY_IDS.map((id) => categoryLabel(id)),
      categoryColor: BOUNDARY_CATEGORY_IDS.map((id) => categoryColor(id)),
      categorySubLabel: BOUNDARY_CATEGORY_IDS.map((id) => categorySubLabel(id)),
      subcategoryLabel: [
        subcategoryLabel("groceries", "supermarket"),
        subcategoryLabel("groceries", "no_such_sub"),
        subcategoryLabel("no_such_parent", "whatever"),
        subcategoryLabel("gas", "whatever"), // real parent, no subcategories at all
      ],
    },

    csv: {
      fullCorpusLength: transactionsToCsv(TRANSACTIONS).length,
      fullCorpusFirstLines: transactionsToCsv(TRANSACTIONS).split("\n").slice(0, 4),
      fullCorpusLastLine: transactionsToCsv(TRANSACTIONS).split("\n").at(-1),
      empty: transactionsToCsv([]),
    },

    stats: {
      isSpendingCounts: (() => {
        let spending = 0;
        let notSpending = 0;
        for (const t of TRANSACTIONS) (isSpending(t) ? spending++ : notSpending++);
        return { spending, notSpending };
      })(),
      dailySpendSeries7: mapDates((now) => dailySpendSeries(TRANSACTIONS, 7, now)),
      dailySpendSeries30: mapDates((now) => dailySpendSeries(TRANSACTIONS, 30, now)),
      monthSpendSeries: mapDates((now) => monthSpendSeries(TRANSACTIONS, now)),
      monthlySpendTotals6: mapDates((now) => monthlySpendTotals(TRANSACTIONS, 6, now)),
      topCategories6: mapDates((now) => topCategories(TRANSACTIONS, 6, now)),
      treatTransactionIds: mapDates((now) =>
        treatTransactions(TRANSACTIONS, now).map((t) => t.id),
      ),
      weekendTransactionIds: mapDates((now) =>
        weekendTransactions(TRANSACTIONS, now).map((t) => t.id),
      ),
      monthInsights: mapDates((now) => monthInsights(TRANSACTIONS, now)),
    },

    history: {
      groupByCategory: digestGroupByCategory(),
      groupByDayAtMidMonth: digestGroupByDay(REFERENCE_DATES.midMonth),
      recencyLabels: mapDates((now) =>
        groupByDay(recencyRows(now), now).map((d) => ({ key: d.key, label: d.label })),
      ),
    },
  };
}

describe("golden fixtures: cross-runtime characterization", () => {
  it("matches the frozen output, or is deliberately regenerated", () => {
    const results = computeResults();
    const serialized = `${JSON.stringify(results, null, 2)}\n`;

    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(GOLDEN_PATH, serialized);
      return;
    }

    if (!existsSync(GOLDEN_PATH)) {
      throw new Error(
        "golden.json is missing. Generate it with: " +
          "UPDATE_GOLDEN=1 npx vitest run src/lib/__fixtures__/golden.test.ts",
      );
    }
    const frozen = readFileSync(GOLDEN_PATH, "utf8");
    // Parse-and-compare (not a raw string diff) so a failure reports the
    // exact path that drifted rather than a wall of JSON.
    expect(JSON.parse(serialized)).toEqual(JSON.parse(frozen));
  });
});
