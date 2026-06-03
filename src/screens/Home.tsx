import { useState } from "react";
import { Banknote, Coins, Eye, EyeOff, Lock, Settings, Vault } from "lucide-react";
import { NetTotal } from "@/components/ui/NetTotal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Carrot } from "@/components/ui/Carrot";
import { AddComposer } from "@/components/AddComposer";
import { HistoryList } from "@/components/HistoryList";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import { monthLabel } from "@/lib/dates";
import { formatUsdCents } from "@/lib/money";
import { formatGrams } from "@/lib/gold";
import type { Transaction } from "@/types/db";

// Amber/gold that reads on the light card (the metal, but legible).
const GOLD_INK = "#A16207";

export function Home() {
  const {
    transactions,
    monthlyNetCents,
    loading,
    deleteTransaction,
    safeTotalCents,
    safeGoldGrams,
    locked,
  } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);

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

  // Passphrase users start each session locked: the entries are ciphertext until
  // they unlock in Settings, so there's nothing to render here yet.
  if (locked) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <Lock className="h-10 w-10 text-label-secondary" strokeWidth={1.75} />
        <div>
          <h1 className="font-display text-xl font-bold uppercase text-label-muted">
            Locked
          </h1>
          <p className="mt-1 text-sm text-label-secondary">
            Your data is end-to-end encrypted. Enter your passphrase to unlock it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="press rounded-pill bg-label px-6 py-3 text-base font-semibold text-surface"
        >
          Unlock in Settings
        </button>
      </main>
    );
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
          balance rides along underneath so saved money shows in the picture. */}
      <section>
        <div className="rounded-card bg-surface px-5 py-5 shadow-card">
          <NetTotal cents={monthlyNetCents} monthLabel={monthLabel()} />
          <div className="mt-4 flex items-center gap-3 rounded-card bg-income/10 px-4 py-3">
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
                    {safeShown ? formatUsdCents(safeTotalCents) : "••••"}
                  </span>
                  <span
                    className="flex items-center gap-1 font-numeric text-sm font-bold tabular-nums"
                    style={{ color: GOLD_INK }}
                  >
                    <Coins className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    {safeShown ? formatGrams(safeGoldGrams) : "•••"}
                  </span>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSafeShown((v) => !v)}
              aria-label={safeShown ? "Hide safe balance" : "Show safe balance"}
              aria-pressed={safeShown}
              className="press -m-2 shrink-0 p-2 text-income/70"
            >
              {safeShown ? (
                <EyeOff className="h-5 w-5" strokeWidth={2} />
              ) : (
                <Eye className="h-5 w-5" strokeWidth={2} />
              )}
            </button>
          </div>
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
