import { useState } from "react";
import { Settings } from "lucide-react";
import { NetTotal } from "@/components/ui/NetTotal";
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

  async function handleDelete(tx: Transaction) {
    if (window.confirm("Delete this entry?")) {
      await deleteTransaction(tx.id);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      {/* Wordmark + settings — the plain Apple nav bar, with a carrot on it. */}
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Carrot className="text-2xl" />
          <span className="font-display text-xl font-bold tracking-tight text-label">
            BucksBuddy
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

      {/* Hero: net this month, green/red. */}
      <section className="rounded-card bg-surface px-5 py-6 shadow-card">
        <NetTotal cents={monthlyNetCents} monthLabel={monthLabel()} />
      </section>

      {/* Composer card. */}
      <section className="rounded-card bg-surface shadow-card">
        <AddComposer editing={editing} onClearEdit={() => setEditing(null)} />
      </section>

      <div>
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-label-secondary">
            History
          </h2>
          <span className="text-xs text-label-secondary">swipe to edit / delete</span>
        </div>
        {loading && transactions.length === 0 ? (
          <p className="py-10 text-center text-label-secondary">Loading…</p>
        ) : (
          <HistoryList
            rows={transactions}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </div>
    </main>
  );
}
