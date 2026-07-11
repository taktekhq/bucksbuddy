import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { HistoryStack } from "@/components/HistoryStack";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import { requestEdit } from "@/lib/editIntent";
import { currentMonthRange, monthAnchor, monthLabel } from "@/lib/dates";
import { groupByCategory, groupByDay } from "@/lib/history";
import { useHistoryGrouping } from "@/lib/useHistoryGrouping";
import posthog from "@/lib/posthog";
import type { Transaction } from "@/types/db";

// The full history in its own page — a deep, neutral-charcoal "rabbit hole"
// you drop into to see everything, deliberately distinct from the bright daily
// tracker and from the Safe's green vault. The page scrolls naturally. Editing
// happens back on Home (where the composer lives), so tapping edit stashes the
// target and navigates there.
//
// Two ways to read it, switchable from the header (remembered across sessions):
// a day-by-day Timeline (the default) or the old all-time By-category stacks.
const RABBIT_HOLE_BG =
  "linear-gradient(180deg, #2C2C2E 0px, #232325 220px, #1C1C1E 460px)";
const RABBIT_HOLE_FLOOR = "#1C1C1E";

export function History() {
  const { transactions, deleteTransaction } = useStore();
  const [grouping, setGrouping] = useHistoryGrouping();
  const days = useMemo(() => groupByDay(transactions), [transactions]);

  // The "By category" view is scoped to one month at a time, paged with the
  // switcher (this month, last month, or further back). The timeline stays
  // all-time. Default to the current month.
  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = useMemo(() => monthAnchor(monthOffset), [monthOffset]);
  const monthTx = useMemo(() => {
    const { from, to } = currentMonthRange(anchor);
    return transactions.filter((t) => {
      const d = new Date(t.occurred_at);
      return d >= from && d < to;
    });
  }, [transactions, anchor]);
  const groups = useMemo(() => groupByCategory(monthTx), [monthTx]);
  const hasOlder = useMemo(() => {
    const { from } = currentMonthRange(anchor);
    return transactions.some((t) => new Date(t.occurred_at) < from);
  }, [transactions, anchor]);

  // Tint the status bar to match the top of the page.
  useThemeColor("#2C2C2E");

  function handleEdit(tx: Transaction) {
    requestEdit(tx.id);
    navigate("/");
  }

  async function handleDelete(tx: Transaction) {
    if (window.confirm("Delete this entry?")) {
      await deleteTransaction(tx.id);
      posthog.capture("transaction_deleted", {
        category: tx.category,
        is_income: tx.is_income,
      });
    }
  }

  return (
    <main
      className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-white"
      style={{ background: RABBIT_HOLE_BG }}
    >
      {/* Fixed floor behind the content so a collapsing browser toolbar or an
          overscroll bounce can never flash the light body canvas through. (Same
          trick the Safe uses.) */}
      <div
        aria-hidden
        className="fixed inset-0"
        style={{ background: RABBIT_HOLE_FLOOR, zIndex: -1 }}
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
          All History
        </h1>
      </header>

      {transactions.length === 0 ? (
        <p className="py-10 text-center text-white/45">Nothin' here yet, Doc.</p>
      ) : (
        <>
          {/* Segmented control: flip between the day-by-day timeline and the
              all-time per-category stacks. */}
          <div
            role="tablist"
            aria-label="Group history by"
            className="flex rounded-pill bg-white/10 p-0.5 text-xs font-semibold"
          >
            {(
              [
                ["timeline", "Timeline"],
                ["category", "By category"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={grouping === value}
                onClick={() => setGrouping(value)}
                className={`press flex-1 rounded-pill px-3 py-1.5 transition-colors ${
                  grouping === value
                    ? "bg-white text-[#1C1C1E] shadow-segment"
                    : "text-white/55"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {grouping === "timeline" ? (
            <HistoryTimeline
              days={days}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <MonthSwitcher
                label={monthLabel(anchor)}
                onPrev={() => setMonthOffset((o) => o - 1)}
                onNext={() => setMonthOffset((o) => Math.min(o + 1, 0))}
                canPrev={hasOlder}
                canNext={monthOffset < 0}
              />
              {groups.length === 0 ? (
                <p className="py-10 text-center text-white/45">
                  Nothin&apos; logged this month, Doc.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {groups.map((g) => (
                    <li key={g.key}>
                      <HistoryStack
                        group={g}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
