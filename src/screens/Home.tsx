import { useState } from "react";
import { Settings } from "lucide-react";
import { NetTotal } from "@/components/ui/NetTotal";
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
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-5 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1.5rem+var(--safe-top))]">
      <div className="flex items-start justify-between">
        <NetTotal cents={monthlyNetCents} monthLabel={monthLabel()} compact />
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="press p-1 text-label-secondary"
          aria-label="Settings"
        >
          <Settings className="h-6 w-6" strokeWidth={1.75} />
        </button>
      </div>

      <AddComposer editing={editing} onClearEdit={() => setEditing(null)} />

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-label-secondary">History</h2>
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
