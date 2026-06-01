import { NetTotal } from "@/components/ui/NetTotal";
import { RecentList } from "@/components/RecentList";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { monthLabel } from "@/lib/dates";

export function Home() {
  const { transactions, monthlyNetCents, loading } = useStore();

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-[calc(6rem+var(--safe-bottom))] pt-[calc(2rem+var(--safe-top))]">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="press text-2xl"
          aria-label="Settings"
        >
          ⚙️
        </button>
      </div>

      <div className="py-8">
        <NetTotal cents={monthlyNetCents} monthLabel={monthLabel()} />
      </div>

      <h2 className="mb-2 px-1 text-sm font-semibold text-label-secondary">Recent</h2>
      {loading && transactions.length === 0 ? (
        <p className="py-10 text-center text-label-secondary">Loading…</p>
      ) : (
        <RecentList rows={transactions.slice(0, 20)} />
      )}

      {/* Floating add button — centered via a flex wrapper so the press scale
          animation stays clean (no transform conflict with centering). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+var(--safe-bottom))] flex justify-center">
        <button
          type="button"
          onClick={() => navigate("/add")}
          className="press pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-label text-4xl font-light text-white shadow-card"
          aria-label="Add entry"
        >
          +
        </button>
      </div>
    </main>
  );
}
