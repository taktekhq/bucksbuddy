import { useMemo, useState } from "react";
import { ChevronLeft, Lock, Repeat } from "lucide-react";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import { useFloorColor } from "@/lib/useFloorColor";
import { useRecurringView, type RecurringView } from "@/lib/useRecurringView";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { amountColorClass, formatCents } from "@/lib/money";
import { CADENCE_LABEL, detectRecurring, type RecurringPayment } from "@/lib/recurring";

// Recurring payments for the signed-in user — the subscriptions, rent, salary
// and other entries that keep coming back on a schedule, found from the history
// (see lib/recurring.ts). Read-only: editing stays where the composer lives.
//
// Two sides, switched from a segmented control and remembered: the monthly
// side (everything that comes round within a month — weekly, every two weeks,
// monthly — totalled per month) and the yearly side (the yearly renewals,
// totalled per year). Within each, the series sit under their category like
// History's stacks do, so a dozen domains read as one block.
//
// Same observatory dressing as Stats, since this is another way of looking at
// the money from above. `userId` is the account whose rows are shown; the
// detector filters on it, so the page can never mix accounts.
const OBSERVATORY_BG =
  "linear-gradient(180deg, #23234A 0px, #1B1B38 220px, #141428 460px)";
const OBSERVATORY_FLOOR = "#141428";

/** "Jun 7" from an ISO timestamp. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "1 time" / "3 times". */
function times(n: number): string {
  return `${n} ${n === 1 ? "time" : "times"}`;
}

/** Which side of the page a series belongs to. */
function viewOf(p: RecurringPayment): RecurringView {
  return p.cadence === "yearly" ? "yearly" : "monthly";
}

/** What a series costs per period of its side: per month, or per year. */
function perPeriodCents(p: RecurringPayment): number {
  return p.cadence === "yearly" ? p.amountCents : p.monthlyCents;
}

// The series of one category, with what they add up to per period.
type CategoryGroup = {
  category: string;
  payments: RecurringPayment[];
  totalCents: number;
};

// Group a side's series by category (the full stored id, so Work · Domains
// and Work · Subscriptions are separate blocks), biggest total first; the
// series inside keep their nearest-due-first order.
function groupByCategory(payments: RecurringPayment[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const p of payments) {
    let g = map.get(p.category);
    if (!g) {
      g = { category: p.category, payments: [], totalCents: 0 };
      map.set(p.category, g);
    }
    g.payments.push(p);
    g.totalCents += perPeriodCents(p);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

export function Recurring({ userId }: { userId: string }) {
  const { transactions, locked, homeCurrency } = useStore();
  const [view, setView] = useRecurringView();

  // Tint the status bar to match the top of the page.
  useThemeColor("#23234A");
  // And the document behind everything, so nothing the browser exposes
  // beyond the page (a collapsed toolbar, the home-indicator inset) is light.
  useFloorColor(OBSERVATORY_FLOOR);

  const summary = useMemo(
    () => detectRecurring(transactions, userId),
    [transactions, userId],
  );
  const masked = locked || summary.anyMasked;

  const shown = summary.payments.filter((p) => viewOf(p) === view);
  const outgoings = shown.filter((p) => !p.isIncome);
  const income = shown.filter((p) => p.isIncome);
  const outCents = outgoings.reduce((sum, p) => sum + perPeriodCents(p), 0);
  const inCents = income.reduce((sum, p) => sum + perPeriodCents(p), 0);
  const period = view === "yearly" ? "year" : "month";

  return (
    <main
      className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-white"
      style={{ background: OBSERVATORY_BG }}
    >
      {/* Fixed floor behind the content so a collapsing browser toolbar or an
          overscroll bounce can never flash the light body canvas through. */}
      <div
        aria-hidden
        className="fixed inset-0"
        style={{ background: OBSERVATORY_FLOOR, zIndex: -1 }}
      />

      {/* Dark nav: back chevron + centered title. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          Recurring
        </h1>
      </header>

      {masked ? (
        // Masked amounts would detect nothing and list zeros — nudge to unlock.
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="press flex w-full items-center gap-3 rounded-card bg-white/10 px-4 py-3.5 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
            <Lock className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-sm text-white/85">
            These entries are encrypted. Enter your passphrase in Settings to
            see them.
          </span>
        </button>
      ) : (
        <>
          {/* Segmented control: the monthly side or the yearly side. */}
          <div
            role="tablist"
            aria-label="Show recurring"
            className="flex rounded-pill bg-white/10 p-0.5 text-xs font-semibold"
          >
            {(
              [
                ["monthly", "Monthly"],
                ["yearly", "Yearly"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={`press flex-1 rounded-pill px-3 py-1.5 transition-colors ${
                  view === value ? "bg-white text-[#1C1C1E] shadow-segment" : "text-white/55"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* The picture for this side: what goes out on repeat, and what comes in. */}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-card bg-white/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
                Out per {period}
              </p>
              <p className={`mt-1 font-numeric text-xl font-bold tabular-nums ${amountColorClass(false)}`}>
                {formatCents(outCents, homeCurrency)}
              </p>
              <p className="mt-0.5 text-xs text-white/55">{outgoings.length} recurring</p>
            </div>
            <div className="rounded-card bg-white/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
                In per {period}
              </p>
              <p className={`mt-1 font-numeric text-xl font-bold tabular-nums ${amountColorClass(true)}`}>
                {formatCents(inCents, homeCurrency)}
              </p>
              <p className="mt-0.5 text-xs text-white/55">{income.length} recurring</p>
            </div>
          </section>

          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Repeat className="h-8 w-8 text-white/30" strokeWidth={1.75} />
              <p className="text-white/55">Nothin&apos; {view} on repeat yet, Doc.</p>
              <p className="max-w-xs text-xs text-white/40">
                {view === "yearly"
                  ? "Log a yearly renewal twice, or put “(yearly)” or a domain name in the note, and it shows up here."
                  : "Log the same entry twice on a regular schedule — weekly, every two weeks or monthly — and it shows up here. Or put “subscription” or “membership” in the note and it counts right away."}
              </p>
            </div>
          ) : (
            <>
              {outgoings.length > 0 && (
                <Side title="Going out" payments={outgoings} currency={homeCurrency} period={period} />
              )}
              {income.length > 0 && (
                <Side title="Coming in" payments={income} currency={homeCurrency} period={period} />
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

// One direction of a side: its Grobold title, then a block per category.
function Side({
  title,
  payments,
  currency,
  period,
}: {
  title: string;
  payments: RecurringPayment[];
  currency: string;
  period: string;
}) {
  const groups = useMemo(() => groupByCategory(payments), [payments]);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 font-display text-sm font-semibold uppercase tracking-wide text-white/60">
        {title}
      </h2>
      {groups.map((g) => (
        <CategoryBlock key={g.category} group={g} currency={currency} period={period} />
      ))}
    </section>
  );
}

// A category's series: a header with the category's chip, name and what its
// series add up to per period, then the series cards.
function CategoryBlock({
  group,
  currency,
  period,
}: {
  group: CategoryGroup;
  currency: string;
  period: string;
}) {
  const Icon = categoryIcon(group.category);
  const color = categoryColor(group.category);
  const isIncome = group.payments[0].isIncome;
  return (
    <section aria-label={categoryLabel(group.category)} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5 px-1">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}33`, color }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/85">
          {categoryLabel(group.category)}
        </span>
        <span className="shrink-0 text-right">
          <span className={`block font-numeric text-sm font-semibold tabular-nums ${amountColorClass(isIncome)}`}>
            {isIncome ? "+" : "-"}
            {formatCents(group.totalCents, currency)}
          </span>
          <span className="block text-[11px] text-white/45">per {period}</span>
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {group.payments.map((p) => (
          <li key={p.key}>
            <PaymentCard payment={p} currency={currency} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// One recurring series: its name (the note, or the category when there is
// none), cadence + next due, and the typical amount. Tapping toggles the
// occurrences behind it, newest first.
function PaymentCard({
  payment,
  currency,
}: {
  payment: RecurringPayment;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const name = payment.note ?? categoryLabel(payment.category);
  const due = payment.overdue
    ? `was due ${shortDate(payment.nextDueAt)}`
    : `next ${shortDate(payment.nextDueAt)}`;

  return (
    <div className="rounded-card bg-white/10 ring-1 ring-inset ring-white/5">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${name}, ${CADENCE_LABEL[payment.cadence].toLowerCase()}, ${times(payment.count)}`}
        onClick={() => setOpen((v) => !v)}
        className="press flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-white">{name}</span>
          <span className={`block text-xs ${payment.overdue ? "text-carrot" : "text-white/55"}`}>
            {CADENCE_LABEL[payment.cadence]} · {due}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block font-numeric font-medium tabular-nums ${amountColorClass(payment.isIncome)}`}>
            {payment.isIncome ? "+" : "-"}
            {formatCents(payment.amountCents, currency)}
          </span>
          <span className="block text-xs text-white/45">
            {payment.previousAmountCents !== null
              ? `was ${formatCents(payment.previousAmountCents, currency)}`
              : times(payment.count)}
          </span>
        </span>
      </button>
      {open && (
        <ul className="border-t border-white/5 px-4">
          {payment.rows.map((tx) => (
            <li
              key={tx.id}
              className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 text-sm last:border-0"
            >
              <span className="text-white/70">{shortDate(tx.occurred_at)}</span>
              <span className="font-numeric tabular-nums text-white/85">
                {formatCents(tx.amount_usd_cents, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
