import { useState } from "react";
import { Settings } from "lucide-react";
import { NetTotal } from "@/components/ui/NetTotal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Carrot } from "@/components/ui/Carrot";
import { AddComposer } from "@/components/AddComposer";
import { HistoryList } from "@/components/HistoryList";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { monthLabel } from "@/lib/dates";
import type { Transaction } from "@/types/db";

export function Home() {
  const { transactions, monthlyNetCents, loading, deleteTransaction } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);

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

      {/* Money for the month — month caption above the net number. */}
      <section>
        <div className="rounded-card bg-surface px-5 py-5 shadow-card">
          <NetTotal cents={monthlyNetCents} monthLabel={monthLabel()} />
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
