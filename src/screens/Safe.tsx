import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  StickyNote,
  Trash2,
  Vault,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatSignedUsdCents, formatUsdCents, netColorClass } from "@/lib/money";
import type { SafeEntry } from "@/types/db";

const SYMBOL: Record<Currency, string> = { USD: "$", LBP: "LL" };

// Keep the typed string clean: digits, a single dot, max two decimals.
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) {
    v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 2);
  }
  return v;
}

function groupInt(s: string): string {
  const [i, d] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d !== undefined ? `${grouped}.${d}` : grouped;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function Safe() {
  const { safeTotalCents, safeEntries, addSafeEntry, deleteSafeEntry, lbpPerUsd } =
    useStore();

  const [isDeposit, setIsDeposit] = useState(true);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [display, setDisplay] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmountString(display);
  const usdCents = toUsdCents(amount, currency, lbpPerUsd);
  const canSave = amount > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const trimmedNote = note.trim();
    const { error: saveError } = await addSafeEntry({
      is_deposit: isDeposit,
      amount_usd_cents: usdCents,
      original_currency: currency,
      original_amount: amount,
      rate_used: lbpPerUsd,
      note: trimmedNote === "" ? null : trimmedNote,
    });

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setDisplay("");
    setNote("");
  }

  async function remove(entry: SafeEntry) {
    if (window.confirm("Delete this safe movement?")) {
      await deleteSafeEntry(entry.id);
    }
  }

  const amountLabel =
    currency === "USD" ? formatUsdCents(usdCents) : `${groupInt(display)} LBP`;
  const cta = saving
    ? "Saving…"
    : amount <= 0
      ? "Enter an amount"
      : isDeposit
        ? `Add ${amountLabel} to safe`
        : `Take ${amountLabel} out`;

  return (
    <main
      className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]"
      style={{
        background: "linear-gradient(180deg, #E6F8EE 0%, #F2F2F7 320px)",
      }}
    >
      {/* Plain iOS nav: back chevron + centered title. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase text-label-muted">
          The Safe
        </h1>
      </header>

      {/* TOTAL — the all-time amount tucked away. */}
      <section>
        <div className="rounded-card bg-surface px-5 py-6 shadow-card">
          <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-label-secondary">
            <Vault className="h-4 w-4" strokeWidth={2} />
            In the safe
          </div>
          <p
            className={`mt-1 font-numeric text-4xl font-bold tabular-nums ${netColorClass(
              safeTotalCents,
            )}`}
          >
            {formatSignedUsdCents(safeTotalCents)}
          </p>
          <p className="mt-1 text-xs text-label-secondary">
            A running total — kept separate from your monthly money.
          </p>
        </div>
      </section>

      {/* COMPOSER — add to or take from the safe. */}
      <section className="flex flex-col gap-2">
        <SectionHeader>Move money</SectionHeader>
        <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
          {/* Add / Take toggle. */}
          <div className="grid grid-cols-2 gap-1 rounded-pill bg-grouped p-1">
            <button
              type="button"
              onClick={() => setIsDeposit(true)}
              className={`press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                isDeposit
                  ? "bg-income text-white shadow-segment"
                  : "text-label-secondary"
              }`}
            >
              <ArrowDownToLine className="h-4 w-4" strokeWidth={2.5} />
              Add
            </button>
            <button
              type="button"
              onClick={() => setIsDeposit(false)}
              className={`press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                !isDeposit
                  ? "bg-carrot text-white shadow-segment"
                  : "text-label-secondary"
              }`}
            >
              <ArrowUpFromLine className="h-4 w-4" strokeWidth={2.5} />
              Take out
            </button>
          </div>

          {/* Amount. */}
          <div className="flex items-center gap-3 rounded-card border border-separator px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-carrot-soft text-base font-bold text-carrot">
              {SYMBOL[currency]}
            </span>
            <input
              inputMode="decimal"
              value={display}
              onChange={(e) => setDisplay(sanitizeAmount(e.target.value))}
              placeholder="0.00"
              aria-label="Amount"
              className="min-w-0 flex-1 bg-transparent font-numeric text-3xl font-bold tabular-nums text-label outline-none placeholder:text-label-secondary"
            />
            <button
              type="button"
              onClick={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
              aria-label="Switch currency"
              className="press shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-label-secondary active:bg-grouped"
            >
              {currency}
            </button>
          </div>
          {currency === "LBP" && amount > 0 && (
            <p className="-mt-1 px-1 text-xs text-label-secondary">
              ≈ {formatUsdCents(usdCents)}
            </p>
          )}

          {/* Note (optional). */}
          <div className="flex items-center gap-3 rounded-card border border-separator px-4 py-3">
            <StickyNote className="h-5 w-5 shrink-0 text-label-secondary" strokeWidth={2} />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              aria-label="Note"
              maxLength={140}
              className="min-w-0 flex-1 bg-transparent text-base text-label outline-none placeholder:text-label-secondary"
            />
          </div>

          {/* CTA. */}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={`press mt-1 w-full rounded-pill py-3.5 text-lg font-semibold text-white transition ${
              canSave
                ? isDeposit
                  ? "bg-income"
                  : "bg-carrot"
                : "bg-separator text-label-secondary"
            }`}
          >
            {cta}
          </button>

          {error && (
            <p className="text-center text-sm font-medium text-expense">{error}</p>
          )}
        </div>
      </section>

      {/* HISTORY — safe movements only. */}
      <section className="flex flex-col gap-2">
        <SectionHeader>Safe history</SectionHeader>
        {safeEntries.length === 0 ? (
          <p className="py-10 text-center text-label-secondary">
            Nothin' in the safe yet, Doc. Add some above.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {safeEntries.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-card bg-surface px-4 py-3.5 shadow-card"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-pill ${
                    e.is_deposit
                      ? "bg-income/10 text-income"
                      : "bg-carrot-soft text-carrot"
                  }`}
                >
                  {e.is_deposit ? (
                    <ArrowDownToLine className="h-5 w-5" strokeWidth={2} />
                  ) : (
                    <ArrowUpFromLine className="h-5 w-5" strokeWidth={2} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-label">
                    {e.is_deposit ? "Added" : "Took out"}
                  </p>
                  {e.note && (
                    <p className="truncate text-xs text-label-secondary">{e.note}</p>
                  )}
                  <p className="text-xs text-label-secondary">
                    {dateLabel(e.occurred_at)}
                    {e.original_currency === "LBP" && " · LBP"}
                  </p>
                </div>
                <span
                  className={`font-numeric font-medium tabular-nums ${
                    e.is_deposit ? "text-income" : "text-carrot"
                  }`}
                >
                  {e.is_deposit ? "+" : "-"}
                  {formatUsdCents(e.amount_usd_cents)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(e)}
                  aria-label="Delete"
                  className="press -m-1 ml-1 p-1 text-label-secondary"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
