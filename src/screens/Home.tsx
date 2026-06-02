import { useState } from "react";
import { ChevronRight, Settings, Vault } from "lucide-react";
import { NetTotal } from "@/components/ui/NetTotal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Carrot } from "@/components/ui/Carrot";
import { AddComposer } from "@/components/AddComposer";
import { HistoryList } from "@/components/HistoryList";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { monthLabel } from "@/lib/dates";
import { formatUsdCents } from "@/lib/money";
import type { Transaction } from "@/types/db";

export function Home() {
  const {
    transactions,
    monthlyNetCents,
    loading,
    deleteTransaction,
    safeEnabled,
    safeTotalCents,
  } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);

  // When there's money tucked away, the whole page picks up a soft savings tint
  // so it's obvious at a glance that the safe is in play.
  const hasSavings = safeEnabled && safeTotalCents > 0;

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

  return (
    <main
      className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] transition-[background] duration-500"
      style={
        hasSavings
          ? {
              background:
                "linear-gradient(180deg, #E6F8EE 0%, #F2F2F7 260px)",
            }
          : undefined
      }
    >
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
          {safeEnabled && (
            <button
              type="button"
              onClick={() => navigate("/safe")}
              className="press -m-2 p-2 text-label-secondary"
              aria-label="Safe"
            >
              <Vault className="h-6 w-6" strokeWidth={1.75} />
            </button>
          )}
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
          balance rides along underneath so saved money shows in the picture. */}
      <section>
        <div className="rounded-card bg-surface px-5 py-5 shadow-card">
          <NetTotal cents={monthlyNetCents} monthLabel={monthLabel()} />
          {safeEnabled && (
            <button
              type="button"
              onClick={() => navigate("/safe")}
              className="press mt-4 flex w-full items-center gap-3 rounded-card bg-income/10 px-4 py-3 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-income/15 text-income">
                <Vault className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-income">
                  In the safe
                </div>
                <div className="font-numeric text-xl font-bold tabular-nums text-income">
                  {formatUsdCents(safeTotalCents)}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-income/60" strokeWidth={2} />
            </button>
          )}
        </div>
      </section>

      {/* "What's up, Doc?" — the add form is always visible and ready. */}
      <section className="flex flex-col gap-2">
        <SectionHeader>What&apos;s up, Doc?</SectionHeader>
        <div className="rounded-card bg-surface shadow-card">
          <AddComposer editing={editing} onClearEdit={clearEdit} />
        </div>
      </section>

      {/* History. */}
      <section className="flex flex-col gap-2">
        <SectionHeader>History</SectionHeader>
        {loading && transactions.length === 0 ? (
          <p className="py-10 text-center text-label-secondary">Loading…</p>
        ) : (
          <HistoryList rows={transactions} onEdit={handleEdit} onDelete={handleDelete} />
        )}
      </section>
    </main>
  );
}
