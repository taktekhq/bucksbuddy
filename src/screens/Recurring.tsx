import { useMemo, useState } from "react";
import { ChevronLeft, Lock, Repeat } from "lucide-react";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { amountColorClass, formatCents } from "@/lib/money";
import { CADENCE_LABEL, detectRecurring, type RecurringPayment } from "@/lib/recurring";

// Recurring payments for the signed-in user — the subscriptions, rent, salary
// and other entries that keep coming back on a schedule, found from the history
// (see lib/recurring.ts). Read-only: editing stays where the composer lives.
//
// Same observatory dressing as Stats, since this is another way of looking at
// the money from above. `userId` is the account whose rows are shown; the
// detector filters on it and the header says so, so it's never ambiguous whose
// payments these are.
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

/** The first block of a UUID, enough to recognise an account at a glance. */
function shortId(userId: string): string {
  return userId.split("-")[0];
}

export function Recurring({ userId }: { userId: string }) {
  const { transactions, locked, homeCurrency } = useStore();

  // Tint the status bar to match the top of the page.
  useThemeColor("#23234A");

  const summary = useMemo(
    () => detectRecurring(transactions, userId),
    [transactions, userId],
  );
  const masked = locked || summary.anyMasked;
  const outgoings = summary.payments.filter((p) => !p.isIncome);
  const income = summary.payments.filter((p) => p.isIncome);

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

      {/* Whose payments these are. */}
      <p className="-mt-3 text-center text-xs text-white/45">
        User <span className="font-numeric tabular-nums">{shortId(userId)}</span>
      </p>

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
          {/* The monthly picture: what goes out on repeat, and what comes in. */}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-card bg-white/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
                Out per month
              </p>
              <p className={`mt-1 font-numeric text-xl font-bold tabular-nums ${amountColorClass(false)}`}>
                {formatCents(summary.monthlyOutCents, homeCurrency)}
              </p>
              <p className="mt-0.5 text-xs text-white/55">
                {outgoings.length} recurring
              </p>
            </div>
            <div className="rounded-card bg-white/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
                In per month
              </p>
              <p className={`mt-1 font-numeric text-xl font-bold tabular-nums ${amountColorClass(true)}`}>
                {formatCents(summary.monthlyInCents, homeCurrency)}
              </p>
              <p className="mt-0.5 text-xs text-white/55">{income.length} recurring</p>
            </div>
          </section>

          {summary.payments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Repeat className="h-8 w-8 text-white/30" strokeWidth={1.75} />
              <p className="text-white/55">Nothin&apos; on repeat yet, Doc.</p>
              <p className="max-w-xs text-xs text-white/40">
                Log the same entry twice on a regular schedule — weekly, every
                two weeks, monthly or yearly — and it shows up here. Or write
                &quot;(yearly)&quot; or &quot;(monthly)&quot; in the note and it
                counts right away.
              </p>
            </div>
          ) : (
            <>
              {outgoings.length > 0 && (
                <Group title="Going out" payments={outgoings} currency={homeCurrency} />
              )}
              {income.length > 0 && (
                <Group title="Coming in" payments={income} currency={homeCurrency} />
              )}
              <p className="px-1 text-center text-xs text-white/40">
                Found from the entries logged so far, not set up by hand: two
                similar entries on a steady schedule, or one whose note says how
                often it repeats.
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}

// Section titles wear Grobold like everywhere else in the app.
function Group({
  title,
  payments,
  currency,
}: {
  title: string;
  payments: RecurringPayment[];
  currency: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-display text-sm font-semibold uppercase tracking-wide text-white/60">
        {title}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {payments.map((p) => (
          <li key={p.key}>
            <PaymentCard payment={p} currency={currency} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// One recurring series: category chip, name (the note when there is one),
// cadence + next due, and the typical amount. Tapping toggles the occurrences
// behind it, newest first.
function PaymentCard({
  payment,
  currency,
}: {
  payment: RecurringPayment;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = categoryIcon(payment.category);
  const color = categoryColor(payment.category);
  const label = categoryLabel(payment.category);
  const name = payment.note ?? label;
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
        className="press flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill"
          style={{ backgroundColor: `${color}33`, color }}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-white">{name}</span>
          {payment.note && (
            <span className="block truncate text-xs text-white/55">{label}</span>
          )}
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
