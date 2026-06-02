import { useState } from "react";
import { Settings } from "lucide-react";
import { NetTotal } from "@/components/ui/NetTotal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Carrot } from "@/components/ui/Carrot";
import { HistoryList } from "@/components/HistoryList";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { monthLabel } from "@/lib/dates";
import { randomBugsLine } from "@/lib/voice";
import type { Transaction } from "@/types/db";

export function Summary({ onEdit }: { onEdit: (tx: Transaction) => void }) {
  const { transactions, monthlyNetCents, loading, deleteTransaction } = useStore();
  // One Bugs-ism per visit, used as the title above the money card.
  const [bugs] = useState(randomBugsLine);

  async function handleDelete(tx: Transaction) {
    if (window.confirm("Delete this entry?")) {
      await deleteTransaction(tx.id);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      {/* Carrot mark + wordmark + settings — the plain Apple nav bar. */}
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Carrot className="text-2xl" />
          <span className="font-display text-sm font-bold uppercase leading-none text-label-muted">
            Bucks
            <br />
            Buddy
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="press -m-2 p-2 text-label-secondary"
          aria-label="Settings"
        >
          <Settings className="h-6 w-6" strokeWidth={1.75} />
        </button>
      </header>

      {/* Bugs-ism title → money-for-the-month card (month sits under the number). */}
      <section className="flex flex-col gap-2">
        <SectionHeader>{bugs}</SectionHeader>
        <div className="rounded-card bg-surface px-5 py-6 shadow-card">
          <NetTotal cents={monthlyNetCents} monthLabel={monthLabel()} />
        </div>
      </section>

      {/* History. */}
      <section className="flex flex-col gap-2">
        <SectionHeader>History</SectionHeader>
        {loading && transactions.length === 0 ? (
          <p className="py-10 text-center text-label-secondary">Loading…</p>
        ) : (
          <HistoryList rows={transactions} onEdit={onEdit} onDelete={handleDelete} />
        )}
      </section>
    </main>
  );
}
