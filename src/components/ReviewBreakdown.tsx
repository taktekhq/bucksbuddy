import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SparkArea } from "@/components/ui/SparkArea";
import { StatBars, type StatBarItem } from "@/components/ui/StatBars";
import { MonthBars, type MonthBar } from "@/components/ui/MonthBars";
import { categoryIcon, categoryLabel } from "@/lib/categories";
import { CHART_INK, rampColor } from "@/lib/reviewChart";
import { CADENCE_LABEL, type RecurringSummary } from "@/lib/recurring";
import { formatCents } from "@/lib/money";
import type { Currency } from "@/lib/currency";
import type { DigestChange, SpendingDigest } from "@/lib/reportDigest";

// The breakdown: everything about this window that a machine can be certain of.
//
// None of this is written by a model, and that is the division of labour the
// whole screen is built on — the arithmetic was done on this device
// (lib/reportDigest) over rows only this device can decrypt, so it is drawn
// here as charts and figures rather than described in a paragraph. The model
// gets one job, further down the screen: judgement.
//
// One thing here the model never sees: FIXED COSTS names them. Recurring
// payments are detected on the device from the note text the reader typed
// (lib/recurring), and note text never leaves the phone — it is not in the
// digest and never will be. So the app can say "Netflix, monthly, $14.99" while
// the auditor can only say "a $14.99 charge repeats in Fees". That asymmetry is
// deliberate, and it is why the naming lives on this side of the screen.

/** How many rows a list section shows before it stops being a breakdown. */
const TOP_ROWS = 6;

export function ReviewBreakdown({
  digest,
  days,
  recurring,
  homeCurrency,
}: {
  digest: SpendingDigest;
  /** Spending per day across the window, oldest first (lib/reportDigest). */
  days: { date: string; cents: number }[];
  /** Detected on this device from note text. Null while it is unavailable. */
  recurring: RecurringSummary | null;
  homeCurrency: Currency;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Hero digest={digest} days={days} />
      <Months digest={digest} />
      <Categories digest={digest} />
      <Saving digest={digest} />
      {recurring !== null && (
        <FixedCosts recurring={recurring} homeCurrency={homeCurrency} />
      )}
      <Movers digest={digest} />
      <Biggest digest={digest} />
      <Weekdays digest={digest} />
      <Rhythm digest={digest} />
    </div>
  );
}

// A card, in the room's own idiom: a hairline instead of a shadow, which is
// invisible on a dark ground.
function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader className="text-review-muted">{title}</SectionHeader>
      <div className="flex flex-col gap-3 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10">
        {children}
        {caption !== undefined && (
          <p className="text-xs leading-relaxed text-review-muted">{caption}</p>
        )}
      </div>
    </section>
  );
}

// The window at a glance: what went out, with the daily shape of it behind the
// figure, and the three totals that frame it.
function Hero({
  digest,
  days,
}: {
  digest: SpendingDigest;
  days: { date: string; cents: number }[];
}) {
  const values = useMemo(() => days.map((d) => d.cents), [days]);
  const busiest = Math.max(...values, 0);
  return (
    <section className="flex flex-col gap-3 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10">
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-review-muted">{digest.period.label}</p>
        <p className="font-numeric text-[34px] font-bold leading-none tabular-nums text-review-text">
          {digest.totals.spent.display}
        </p>
        <p className="text-xs text-review-muted">
          spent over {digest.period.days}{" "}
          {digest.period.days === 1 ? "day" : "days"} ·{" "}
          {digest.totals.dailyAverage.display} a day
        </p>
      </div>
      {/* No "out" tile: the big figure above IS what went out, and printing it
          twice made the row read as four totals instead of three. */}
      <dl className="flex gap-2">
        <Tile label="In" value={digest.totals.income.display} />
        <Tile label="Left" value={digest.totals.net.display} />
        <Tile label="Put away" value={digest.saving.netIntoSafe.display} />
      </dl>
      {/* The days, as their own labelled strip rather than as a wash behind the
          figures. Behind them it was unreadable in both directions: a spike a
          day tall crowded the type, and nothing said what the shape was. */}
      {values.length > 1 && (
        <div className="flex flex-col gap-1 border-t border-white/10 pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-review-muted">Day by day</span>
            <span className="font-numeric text-[11px] tabular-nums text-review-muted">
              busiest {formatCents(busiest, digest.currency.code)}
            </span>
          </div>
          <SparkArea
            values={values}
            stroke={CHART_INK}
            fill={`${CHART_INK}26`}
            className="h-12 w-full"
          />
        </div>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-card bg-review-tile px-3 py-2">
      <dt className="text-[11px] text-review-muted">{label}</dt>
      <dd className="font-numeric truncate text-[15px] font-bold tabular-nums text-review-text">
        {value}
      </dd>
    </div>
  );
}

/** "September 2026" → "Sep". */
function shortMonth(label: string): string {
  return label.slice(0, 3);
}

/** Days in the calendar month a "YYYY-MM" key names. */
function daysInMonth(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function Months({ digest }: { digest: SpendingDigest }) {
  const bars: MonthBar[] = digest.months.map((m) => ({
    key: m.key,
    label: m.label,
    short: shortMonth(m.label),
    cents: m.spent.cents,
    display: m.spent.display,
    days: m.days,
    monthDays: daysInMonth(m.key),
  }));
  if (bars.length < 2) return null;

  // The window ends when it was asked for, so its last month is usually
  // part-way through. Say so under the chart rather than letting a shorter bar
  // be read as less spending.
  const last = digest.months[digest.months.length - 1];
  const partial = last.days < daysInMonth(last.key);

  return (
    <Panel
      title="Month by month"
      caption={
        partial
          ? `${last.label} is ${last.days} ${
              last.days === 1 ? "day" : "days"
            } in, so its bar is hatched — it is not a smaller month yet. It is running at ${
              last.dailyAverage.display
            } a day.`
          : undefined
      }
    >
      <MonthBars bars={bars} color={CHART_INK} label="Spent per month" />
    </Panel>
  );
}

function Categories({ digest }: { digest: SpendingDigest }) {
  const top = digest.categories.slice(0, TOP_ROWS);
  if (top.length === 0) return null;
  const widest = Math.max(...top.map((c) => c.spent.cents), 1);
  // Coloured by RANK, not by category: several category colours are the exact
  // hexes this app uses for "money in" and "money out", and this is a screen
  // about spending. See lib/reviewChart.
  const items: StatBarItem[] = top.map((c, rank) => ({
    id: c.label,
    label: c.label,
    icon: categoryIcon(c.id),
    color: rampColor(rank),
    value: c.spent.display,
    fraction: c.spent.cents / widest,
  }));

  return (
    <Panel
      title="Where it went"
      caption={`${top[0].label} is ${top[0].sharePct}% of everything spent, at ${top[0].averageEntry.display} an entry across ${top[0].count}.`}
    >
      <div className="text-review-text">
        <StatBars items={items} />
      </div>
    </Panel>
  );
}

function Saving({ digest }: { digest: SpendingDigest }) {
  const { saving, totals } = digest;
  // Nothing to show for an account that has never used the Safe and logged no
  // income: the card would be four zeroes and a share of nothing.
  if (
    saving.intoSafe.cents === 0 &&
    saving.outOfSafe.cents === 0 &&
    totals.income.cents === 0
  ) {
    return null;
  }

  return (
    <Panel
      title="Saving"
      caption={
        saving.savedSharePct === null
          ? "No income logged in this window, so there is no share to take of it."
          : `${saving.savedSharePct}% of what came in reached the Safe. ${
              saving.leftOverSharePct
            }% went unspent — the gap is money that stayed in the open.`
      }
    >
      <dl className="flex gap-2">
        <Tile label="Into the Safe" value={saving.intoSafe.display} />
        <Tile label="Back out" value={saving.outOfSafe.display} />
        <Tile label="Net" value={saving.netIntoSafe.display} />
      </dl>
      <p className="rounded-card bg-review-tile px-3 py-2.5 text-[13px] leading-snug text-review-muted">
        Moving money to the Safe is a transfer, so it is neither spending nor
        income anywhere else on this screen.
      </p>
    </Panel>
  );
}

function FixedCosts({
  recurring,
  homeCurrency,
}: {
  recurring: RecurringSummary;
  homeCurrency: Currency;
}) {
  // A masked row carries amount 0 (the device is locked for that value), so
  // every total here would be wrong rather than merely incomplete.
  if (recurring.anyMasked) return null;
  const payments = recurring.payments.filter((p) => !p.isIncome);
  if (payments.length === 0) return null;
  const top = payments
    .slice()
    .sort((a, b) => b.monthlyCents - a.monthlyCents)
    .slice(0, TOP_ROWS);

  return (
    <Panel
      title="Fixed costs"
      caption={`${payments.length} repeating ${
        payments.length === 1 ? "payment" : "payments"
      }, ${formatCents(
        recurring.monthlyOutCents,
        homeCurrency,
      )} a month between them. Detected from your own notes, which never leave this phone.`}
    >
      <ul className="flex flex-col gap-2.5">
        {top.map((payment, rank) => {
          const Icon = categoryIcon(payment.category);
          const color = rampColor(rank);
          return (
            <li key={payment.key} className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${color}26`, color }}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-review-text">
                  {payment.note ?? categoryLabel(payment.category)}
                </span>
                <span className="text-[11px] text-review-muted">
                  {CADENCE_LABEL[payment.cadence]} · ×{payment.count}
                  {payment.previousAmountCents !== null &&
                    ` · was ${formatCents(payment.previousAmountCents, homeCurrency)}`}
                </span>
              </span>
              <span className="font-numeric shrink-0 text-sm font-bold tabular-nums text-review-text">
                {formatCents(payment.amountCents, homeCurrency)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * The arrow for a category's movement between the two months.
 *
 * Deliberately colourless. Green and red mean money in and money out in this
 * app, and a category's spending falling is neither — nor is it necessarily
 * good news: Health going down is not a win. The arrow states the direction and
 * stops there, which is all the device actually knows.
 */
function moveArrow(direction: DigestChange["direction"]) {
  if (direction === "up") return ArrowUpRight;
  if (direction === "down") return ArrowDownRight;
  return Minus;
}

function Movers({ digest }: { digest: SpendingDigest }) {
  const moves = digest.monthOverMonth.slice(0, TOP_ROWS);
  // Empty whenever the window holds fewer than two WHOLE months — the only
  // honest comparison is between finished months, so there is nothing to draw.
  if (moves.length === 0) return null;
  const { firstMonth, lastMonth } = moves[0];

  return (
    <Panel
      title="What moved"
      caption={`${firstMonth} against ${lastMonth} — the two whole months in this window. A month that is still running is left out rather than scaled, and any months between these two are not in this list.`}
    >
      <ul className="flex flex-col gap-2.5">
        {moves.map((move) => {
          const Icon = moveArrow(move.direction);
          return (
            <li key={move.category} className="flex items-center gap-3">
              <Icon
                className="h-4 w-4 shrink-0 text-review-muted"
                strokeWidth={2.5}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-review-text">
                {move.category}
              </span>
              <span className="font-numeric shrink-0 text-[11px] tabular-nums text-review-muted">
                {move.first.display} → {move.last.display}
              </span>
              <span className="font-numeric w-14 shrink-0 text-right text-sm font-bold tabular-nums text-review-text">
                {move.changePct === null
                  ? "new"
                  : `${move.changePct > 0 ? "+" : ""}${move.changePct}%`}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Biggest({ digest }: { digest: SpendingDigest }) {
  if (digest.largestExpenses.length === 0) return null;
  return (
    <Panel
      title="Biggest single entries"
      caption={`Typical entry: ${digest.totals.medianExpense.display}. Average: ${digest.totals.averageExpense.display}.`}
    >
      <ul className="flex flex-col gap-2">
        {digest.largestExpenses.map((entry, i) => (
          <li
            key={`${i}-${entry.date}`}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="min-w-0 truncate text-sm text-review-text">
              {entry.category}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="text-[11px] text-review-muted">{entry.date}</span>
              <span className="font-numeric text-sm font-bold tabular-nums text-review-text">
                {entry.amount.display}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// The one Apple-Health shape everyone recognises, and the one that needs a
// warning attached. `occurred_at` is stamped when an entry is TYPED — the
// composer has no date picker — so this is a chart of logging habits wearing
// the clothes of a chart of spending habits. Hence "logged on", everywhere.
function Weekdays({ digest }: { digest: SpendingDigest }) {
  const week = digest.weekdaysLogged;
  const widest = Math.max(...week.map((d) => d.spent.cents), 1);
  if (widest === 1) return null;

  return (
    <Panel
      title="Logged on"
      caption={`${digest.weekendSharePct}% of it was logged at the weekend. These are the days entries were typed, not necessarily the days money moved.`}
    >
      <div className="flex flex-col gap-2" role="img" aria-label="Logged per weekday">
        <ol className="flex h-20 items-end gap-1.5">
          {week.map((day) => (
            <li
              key={day.label}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              aria-label={`${day.label}: ${day.spent.display}`}
            >
              <div
                className="w-full rounded-t-[3px]"
                style={{
                  height: `${Math.max((day.spent.cents / widest) * 100, 2)}%`,
                  backgroundColor: CHART_INK,
                }}
              />
            </li>
          ))}
        </ol>
        <ol className="flex gap-1.5">
          {week.map((day) => (
            <li
              key={day.label}
              className="min-w-0 flex-1 text-center text-[10px] text-review-muted"
            >
              {day.label.slice(0, 1)}
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

function Rhythm({ digest }: { digest: SpendingDigest }) {
  const { coverage, totals } = digest;
  return (
    <Panel
      title="How complete this is"
      caption={
        coverage.longestGapDays > 0
          ? // The gap between the two averages IS the coverage story: a wide
            // gap means thin logging rather than thrift, which is the single
            // easiest figure on this screen to misread.
            `${totals.dailyAverage.display} a day across every day, ${totals.perLoggedDayAverage.display} across the days with entries. The longest stretch with nothing logged was ${coverage.longestGapDays} ${
              coverage.longestGapDays === 1 ? "day" : "days"
            } — anything spent then is not in these figures.`
          : "Every day in the window has something logged, so nothing is missing from these figures."
      }
    >
      <dl className="flex gap-2">
        <Tile
          label="Days logged"
          value={`${coverage.daysLogged}/${coverage.days}`}
        />
        <Tile label="Entries" value={String(totals.entryCount)} />
        <Tile
          label="No-spend days"
          value={String(coverage.daysWithNoSpending)}
        />
      </dl>
      <div
        className="h-1.5 overflow-hidden rounded-pill bg-white/10"
        role="progressbar"
        aria-valuenow={coverage.coveragePct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Days with entries"
      >
        <div
          className="h-full rounded-pill bg-carrot"
          style={{ width: `${Math.min(coverage.coveragePct, 100)}%` }}
        />
      </div>
      {coverage.busiestDay !== null && (
        <p className="text-xs text-review-muted">
          Busiest day of logging: {coverage.busiestDay.date},{" "}
          {coverage.busiestDay.count}{" "}
          {coverage.busiestDay.count === 1 ? "entry" : "entries"} totalling{" "}
          {coverage.busiestDay.spent.display}.
        </p>
      )}
    </Panel>
  );
}
