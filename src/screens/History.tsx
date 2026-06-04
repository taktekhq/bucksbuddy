import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { HistoryStack } from "@/components/HistoryStack";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import { requestEdit } from "@/lib/editIntent";
import { groupByCategory } from "@/lib/history";
import type { Transaction } from "@/types/db";

// The full history in its own page — a deep, neutral-charcoal "rabbit hole"
// you drop into to see everything, deliberately distinct from the bright daily
// tracker and from the Safe's green vault. Entries are stacked by category;
// the page scrolls naturally. Editing happens back on Home (where the composer
// lives), so tapping edit stashes the target and navigates there.
const RABBIT_HOLE_BG =
  "linear-gradient(180deg, #2C2C2E 0px, #232325 220px, #1C1C1E 460px)";
const RABBIT_HOLE_FLOOR = "#1C1C1E";

export function History() {
  const { transactions, deleteTransaction } = useStore();
  const groups = useMemo(() => groupByCategory(transactions), [transactions]);

  // Tint the status bar to match the top of the page.
  useThemeColor("#2C2C2E");

  function handleEdit(tx: Transaction) {
    requestEdit(tx.id);
    navigate("/");
  }

  async function handleDelete(tx: Transaction) {
    if (window.confirm("Delete this entry?")) {
      await deleteTransaction(tx.id);
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

      {groups.length === 0 ? (
        <p className="py-10 text-center text-white/45">Nothin' here yet, Doc.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {groups.map((g) => (
            <li key={g.key}>
              <HistoryStack group={g} onEdit={handleEdit} onDelete={handleDelete} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
