import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  StickyNote,
  Trash2,
  Vault,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatSignedUsdCents, formatUsdCents } from "@/lib/money";
import type { SafeEntry } from "@/types/db";

const SYMBOL: Record<Currency, string> = { USD: "$", LBP: "LL" };

// The Safe lives in its own dark "vault" world — a deliberately different
// mentality from the bright daily tracker. The whole viewport goes deep green
// while you're in here, restored on the way out.
const VAULT_BG = "linear-gradient(180deg, #0A3A2A 0%, #06281E 55%, #03150F 100%)";
const GOLD = "#FFD479";
const MINT = "#7CE6AA";
const TAKE = "#FFA866";

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

  // Paint the entire page (beyond the phone-width column too) the vault color
  // while this screen is mounted; put it back when we leave.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = VAULT_BG;
    return () => {
      document.body.style.background = prev;
    };
  }, []);

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
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-white">
      {/* Dark nav: back chevron + centered title. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2"
          style={{ color: GOLD }}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          The Safe
        </h1>
      </header>

      {/* TOTAL — the all-time amount tucked away. Gold, like a vault. */}
      <section>
        <div className="rounded-card bg-white/[0.06] px-5 py-7 ring-1 ring-white/10 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-white/55">
            <Vault className="h-4 w-4" strokeWidth={2} />
            In the safe
          </div>
          <p
            className="mt-1 font-numeric text-5xl font-bold tabular-nums"
            style={{ color: safeTotalCents < 0 ? "#FF8A8A" : GOLD }}
          >
            {formatSignedUsdCents(safeTotalCents)}
          </p>
          <p className="mt-1.5 text-xs text-white/45">
            A running total — kept separate from your monthly money.
          </p>
        </div>
      </section>

      {/* COMPOSER — add to or take from the safe. */}
      <section className="flex flex-col gap-2">
        <h2 className="px-2 font-display text-sm font-semibold uppercase tracking-wide text-white/55">
          Move money
        </h2>
        <div className="flex flex-col gap-3 rounded-card bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur">
          {/* Add / Take toggle. */}
          <div className="grid grid-cols-2 gap-1 rounded-pill bg-black/25 p-1">
            <button
              type="button"
              onClick={() => setIsDeposit(true)}
              className={`press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                isDeposit ? "text-white shadow-segment" : "text-white/55"
              }`}
              style={isDeposit ? { backgroundColor: "#1FB85A" } : undefined}
            >
              <ArrowDownToLine className="h-4 w-4" strokeWidth={2.5} />
              Add
            </button>
            <button
              type="button"
              onClick={() => setIsDeposit(false)}
              className={`press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                !isDeposit ? "text-white shadow-segment" : "text-white/55"
              }`}
              style={!isDeposit ? { backgroundColor: "#E0631A" } : undefined}
            >
              <ArrowUpFromLine className="h-4 w-4" strokeWidth={2.5} />
              Take out
            </button>
          </div>

          {/* Amount. */}
          <div className="flex items-center gap-3 rounded-card border border-white/15 bg-black/15 px-4 py-3.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-bold"
              style={{ color: MINT }}
            >
              {SYMBOL[currency]}
            </span>
            <input
              inputMode="decimal"
              value={display}
              onChange={(e) => setDisplay(sanitizeAmount(e.target.value))}
              placeholder="0.00"
              aria-label="Amount"
              className="min-w-0 flex-1 bg-transparent font-numeric text-3xl font-bold tabular-nums text-white outline-none placeholder:text-white/35"
            />
            <button
              type="button"
              onClick={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
              aria-label="Switch currency"
              className="press shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-white/70 active:bg-white/10"
            >
              {currency}
            </button>
          </div>
          {currency === "LBP" && amount > 0 && (
            <p className="-mt-1 px-1 text-xs text-white/45">
              ≈ {formatUsdCents(usdCents)}
            </p>
          )}

          {/* Note (optional). */}
          <div className="flex items-center gap-3 rounded-card border border-white/15 bg-black/15 px-4 py-3">
            <StickyNote className="h-5 w-5 shrink-0 text-white/45" strokeWidth={2} />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              aria-label="Note"
              maxLength={140}
              className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/35"
            />
          </div>

          {/* CTA. */}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="press mt-1 w-full rounded-pill py-3.5 text-lg font-semibold transition disabled:cursor-not-allowed"
            style={
              canSave
                ? { backgroundColor: isDeposit ? "#1FB85A" : "#E0631A", color: "#FFFFFF" }
                : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
            }
          >
            {cta}
          </button>

          {error && (
            <p className="text-center text-sm font-medium" style={{ color: "#FF8A8A" }}>
              {error}
            </p>
          )}
        </div>
      </section>

      {/* HISTORY — safe movements only. */}
      <section className="flex flex-col gap-2">
        <h2 className="px-2 font-display text-sm font-semibold uppercase tracking-wide text-white/55">
          Safe history
        </h2>
        {safeEntries.length === 0 ? (
          <p className="py-10 text-center text-white/45">
            Nothin' in the safe yet, Doc. Add some above.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {safeEntries.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-card bg-white/[0.06] px-4 py-3.5 ring-1 ring-white/10"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-white/10"
                  style={{ color: e.is_deposit ? MINT : TAKE }}
                >
                  {e.is_deposit ? (
                    <ArrowDownToLine className="h-5 w-5" strokeWidth={2} />
                  ) : (
                    <ArrowUpFromLine className="h-5 w-5" strokeWidth={2} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">
                    {e.is_deposit ? "Added" : "Took out"}
                  </p>
                  {e.note && (
                    <p className="truncate text-xs text-white/50">{e.note}</p>
                  )}
                  <p className="text-xs text-white/50">
                    {dateLabel(e.occurred_at)}
                    {e.original_currency === "LBP" && " · LBP"}
                  </p>
                </div>
                <span
                  className="font-numeric font-medium tabular-nums"
                  style={{ color: e.is_deposit ? MINT : TAKE }}
                >
                  {e.is_deposit ? "+" : "-"}
                  {formatUsdCents(e.amount_usd_cents)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(e)}
                  aria-label="Delete"
                  className="press -m-1 ml-1 p-1 text-white/45"
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
