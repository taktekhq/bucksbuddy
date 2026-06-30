import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  Lock,
  Settings,
  Vault,
} from "lucide-react";
import { NetTotal } from "@/components/ui/NetTotal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SparkArea } from "@/components/ui/SparkArea";
import { Carrot } from "@/components/ui/Carrot";
import { AddComposer } from "@/components/AddComposer";
import { HistoryList } from "@/components/HistoryList";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { takePendingEdit } from "@/lib/editIntent";
import { useThemeColor } from "@/lib/useThemeColor";
import { isToday, monthLabel } from "@/lib/dates";
import { dailySpendSeries } from "@/lib/stats";
import { formatUsdCents } from "@/lib/money";
import { formatGrams } from "@/lib/gold";
import type { Transaction } from "@/types/db";

// Amber/gold that reads on the light card (the metal, but legible).
const GOLD_INK = "#A16207";

export function Home() {
  const {
    transactions,
    balanceCents,
    loading,
    deleteTransaction,
    safeTotalCents,
    safeGoldGrams,
    locked,
  } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);

  // The full history lives on its own "/history" page; the page itself only
  // lists today's entries so it doesn't grow without bound.
  const todays = transactions.filter((t) => isToday(t.occurred_at));

  // Editing a row on the full-history page navigates back here with the target
  // stashed; pick it up once the matching transaction is in hand.
  const [pendingEditId, setPendingEditId] = useState<string | null>(takePendingEdit);
  useEffect(() => {
    if (!pendingEditId) return;
    const tx = transactions.find((t) => t.id === pendingEditId);
    if (tx) {
      setEditing(tx);
      setPendingEditId(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [pendingEditId, transactions]);

  // The safe balance is private by default — tap the eye to reveal it.
  const [safeShown, setSafeShown] = useState(false);

  // When there's money or gold tucked away, the whole page picks up a soft
  // savings tint so it's obvious at a glance that the safe is in play.
  const hasSavings = safeTotalCents > 0 || safeGoldGrams > 0;

  // Match the status bar to the top of the page (mint when tinted, else canvas).
  useThemeColor(hasSavings ? "#E6F8EE" : "#F2F2F7");

  function handleEdit(tx: Transaction) {
    setEditing(tx);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearEdit() {
    setEditing(null);
  }

  async function handleDelete(tx: Transaction) {
    if (window.confirm("Delete this entry?")) {
      await deleteTransaction(tx.id);
    }
  }

  // When locked (this device doesn't have the passphrase yet) amounts show
  // obscured, so the safe balance can't be revealed either.
  const reveal = safeShown && !locked;

  // The last 30 days of spending, washed faintly behind the hero — the same
  // daily chart the Stats page draws, dialed down to sit on the light card.
  // Hidden while locked: masked amounts read as zeros, and a flat line would
  // be a lie.
  const sparkValues = useMemo(
    () => dailySpendSeries(transactions, 30).map((p) => p.totalCents),
    [transactions],
  );

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      {/* Savings tint as a fixed, viewport-filling backdrop so the gradient
          spans the full width on desktop (instead of being clipped to the
          centered max-w-md column) and never flashes the canvas on overscroll.
          Same trick as Safe / History; `z-index: -1` keeps it behind the
          cards. */}
      <div
        aria-hidden
        className="fixed inset-0 transition-[background] duration-500"
        style={{
          background: hasSavings
            ? "linear-gradient(180deg, #E6F8EE 0%, #F2F2F7 260px)"
            : undefined,
          zIndex: -1,
        }}
      />
      {/* Carrot mark + wordmark + safe + settings — the plain Apple nav bar. */}
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Carrot className="text-2xl" />
          <span className="font-display text-sm font-bold uppercase leading-none text-label-muted">
            Bucks
            <br />
            Buddy
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/safe")}
            className="press -m-2 p-2 text-label-secondary"
            aria-label="Safe"
          >
            <Vault className="h-6 w-6" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="press -m-2 p-2 text-label-secondary"
            aria-label="Settings"
          >
            <Settings className="h-6 w-6" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Money for the month — month caption above the net number. The safe
          balance rides along underneath so saved money shows in the picture.
          Tapping the number opens the Stats page; the spending sparkline sits
          washed-out behind everything (overflow-hidden clips it to the card's
          radius). */}
      <section>
        {/* min-h matches the Stats headline card exactly, so tapping through
            feels like the same card changing rooms. (Keep in sync with
            Stats.tsx.) */}
        <div className="relative min-h-[188px] overflow-hidden rounded-card bg-surface px-5 py-5 shadow-card">
          {!locked && (
            <SparkArea
              values={sparkValues}
              stroke="rgba(245, 99, 0, 0.4)"
              fill="rgba(245, 99, 0, 0.1)"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          )}
          <button
            type="button"
            onClick={() => navigate("/stats")}
            aria-label="See your stats"
            className="press relative block w-full text-left"
          >
            {/* The headline is the running balance — it carries across months
                instead of resetting to $0 on the 1st. Just the month rides
                underneath for context: a per-month net would be misleading here,
                since a carried-over surplus or deficit isn't money earned or
                lost this month. (Per-month spending lives on the Stats page.) */}
            <NetTotal cents={balanceCents} label="Balance" masked={locked} />
            <p className="mt-1 text-[13px] font-medium text-label-secondary">
              {monthLabel()}
            </p>
            {/* iOS-style disclosure hint: this number goes somewhere. */}
            <span
              aria-hidden
              className="absolute right-0 top-1/2 -translate-y-1/2 text-label-muted"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} />
            </span>
          </button>
          {/* Only the number is the stats tap target — this row already has
              buttons of its own, and nesting them would be invalid HTML.
              `relative` keeps the row above the sparkline. */}
          <div className="relative mt-4 flex items-center gap-3 rounded-card bg-income/10 px-4 py-3">
            <button
              type="button"
              onClick={() => navigate("/safe")}
              className="press flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-income/15 text-income">
                <Vault className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-income">
                  In the safe
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="flex items-center gap-1 font-numeric text-xl font-bold tabular-nums text-income">
                    <Banknote className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {reveal ? formatUsdCents(safeTotalCents) : "••••"}
                  </span>
                  <span
                    className="flex items-center gap-1 font-numeric text-sm font-bold tabular-nums"
                    style={{ color: GOLD_INK }}
                  >
                    <Coins className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    {reveal ? formatGrams(safeGoldGrams) : "•••"}
                  </span>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSafeShown((v) => !v)}
              disabled={locked}
              aria-label={reveal ? "Hide safe balance" : "Show safe balance"}
              aria-pressed={reveal}
              className="press -m-2 shrink-0 p-2 text-income/70 disabled:opacity-40"
            >
              {reveal ? (
                <EyeOff className="h-5 w-5" strokeWidth={2} />
              ) : (
                <Eye className="h-5 w-5" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* "What's up, Doc?" — the add form is always visible and ready. While
          locked you can't encrypt new entries, so it's a nudge to unlock. */}
      <section className="flex flex-col gap-2">
        <SectionHeader>What&apos;s up, Doc?</SectionHeader>
        {locked ? (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="press flex w-full items-center gap-3 rounded-card bg-surface px-4 py-3.5 text-left shadow-card"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-grouped text-label-secondary">
              <Lock className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="text-sm text-label">
              Locked — enter your passphrase in Settings to view and add.
            </span>
          </button>
        ) : (
          <div className="rounded-card bg-surface shadow-card">
            <AddComposer editing={editing} onClearEdit={clearEdit} />
          </div>
        )}
      </section>

      {/* History — today's entries inline; everything else in the drawer. */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionHeader>History</SectionHeader>
          {transactions.length > 0 && (
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="press px-2 text-sm font-semibold text-carrot"
            >
              Show all
            </button>
          )}
        </div>
        {loading && transactions.length === 0 ? (
          <p className="py-10 text-center text-label-secondary">Loading…</p>
        ) : todays.length > 0 ? (
          <HistoryList rows={todays} onEdit={handleEdit} onDelete={handleDelete} />
        ) : (
          <p className="py-10 text-center text-label-secondary">
            {transactions.length > 0
              ? "Nothin' today, Doc."
              : "Nothin' here yet, Doc. Add your first one above."}
          </p>
        )}
      </section>
    </main>
  );
}
