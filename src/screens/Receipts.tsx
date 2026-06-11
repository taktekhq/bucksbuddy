import { useMemo } from "react";
import { ChevronLeft, Lock } from "lucide-react";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { monthLabel } from "@/lib/dates";
import { formatUsdCents } from "@/lib/money";
import { treatTransactions, weekendTransactions } from "@/lib/stats";

// The receipts behind a tappable fun-fact chip: a read-only page listing this
// month's entries, reached from "Treat yourself" / "Weekend Spend" on Stats.
// A full page (not a drawer) so a long month scrolls with the document like
// everywhere else. Editing stays where the composer lives — Home.
//
// Same observatory dressing as Stats, so the tap-through feels like stepping
// deeper into the same room.
const OBSERVATORY_BG =
  "linear-gradient(180deg, #23234A 0px, #1B1B38 220px, #141428 460px)";
const OBSERVATORY_FLOOR = "#141428";

/** "1 entry" / "3 entries". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Jun 7" from an ISO timestamp. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function Receipts({ kind }: { kind: "treats" | "weekend" }) {
  const { transactions, locked } = useStore();

  // Tint the status bar to match the top of the page.
  useThemeColor("#23234A");

  const rows = useMemo(
    () =>
      kind === "treats"
        ? treatTransactions(transactions)
        : weekendTransactions(transactions),
    [kind, transactions],
  );
  const totalCents = rows.reduce((sum, r) => sum + r.amount_usd_cents, 0);
  const masked = locked || rows.some((r) => r.amountMask != null);

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

      {/* Dark nav: back chevron to Stats + centered title. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/stats")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          {kind === "treats" ? "Treat Yourself" : "Weekend Spend"}
        </h1>
      </header>

      {masked ? (
        // Masked amounts would list as zeros — nudge to unlock instead.
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
          {/* The month and its damage. */}
          <section className="rounded-card bg-white/10 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
                {monthLabel()}
              </p>
              <p className="font-numeric text-xl font-bold tabular-nums">
                {formatUsdCents(totalCents)}
              </p>
            </div>
            <p className="text-xs text-white/55">{count(rows.length, "entry", "entries")}</p>
          </section>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-white/55">
              Nothin&apos; here this month, Doc.
            </p>
          ) : (
            <section className="rounded-card bg-white/10 px-4">
              <ul>
                {rows.map((tx) => {
                  const Icon = categoryIcon(tx.category);
                  const color = categoryColor(tx.category);
                  return (
                    <li
                      key={tx.id}
                      className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${color}26`, color }}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {categoryLabel(tx.category)}
                        </p>
                        {tx.note && (
                          <p className="truncate text-xs text-white/55">{tx.note}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-numeric text-sm font-bold tabular-nums">
                          {formatUsdCents(tx.amount_usd_cents)}
                        </p>
                        <p className="text-xs text-white/45">{shortDate(tx.occurred_at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
