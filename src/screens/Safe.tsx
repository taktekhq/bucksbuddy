import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  ChevronLeft,
  Coins,
  StickyNote,
  Trash2,
  Vault,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { SAFE_CATEGORY_ID } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatSignedUsdCents, formatUsdCents } from "@/lib/money";
import { fetchGoldUsdPerGram, formatGrams } from "@/lib/gold";
import type { SafeGoldEntry, Transaction } from "@/types/db";

type Asset = "cash" | "gold";

const SYMBOL: Record<Currency, string> = { USD: "$", LBP: "LL" };

// The Safe lives in its own dark "vault" world — a deliberately different
// mentality from the bright daily tracker. The whole viewport goes deep green
// while you're in here, restored on the way out.
const VAULT_BG = "linear-gradient(180deg, #0A3A2A 0%, #06281E 55%, #03150F 100%)";
const VAULT_DEEP = "#03150F"; // solid base for the status bar + overscroll area
const GOLD = "#FFD479";
const MINT = "#7CE6AA";
const TAKE = "#FFA866";

// Keep the typed amount clean: digits, a single dot, max two decimals.
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) {
    v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 2);
  }
  return v;
}

// Grams allow finer precision — up to three decimals (milligrams).
function sanitizeGrams(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) {
    v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 3);
  }
  return v;
}

function parseGrams(display: string): number {
  if (!display || display === ".") return 0;
  const n = Number.parseFloat(display);
  return Number.isFinite(n) && n >= 0 ? n : 0;
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

// Cash and gold normalized into one shape for the shared history list.
type Move = {
  key: string;
  kind: Asset;
  isDeposit: boolean; // true = added to the safe
  occurredAt: string;
  note: string | null;
  cents?: number;
  grams?: number;
  isLbp?: boolean;
  onDelete: () => void | Promise<void>;
};

export function Safe() {
  const {
    safeTotalCents,
    transactions,
    addTransaction,
    deleteTransaction,
    safeGoldGrams,
    safeGoldEntries,
    addSafeGoldEntry,
    deleteSafeGoldEntry,
    lbpPerUsd,
  } = useStore();

  const [asset, setAsset] = useState<Asset>("cash");
  const [isDeposit, setIsDeposit] = useState(true);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [display, setDisplay] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort live gold price (USD per gram); null while loading or if the
  // API is unreachable. Grams work fine without it.
  const [goldPerGram, setGoldPerGram] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    fetchGoldUsdPerGram().then((v) => {
      if (active) setGoldPerGram(v);
    });
    return () => {
      active = false;
    };
  }, []);

  // Paint the entire page the vault color while this screen is mounted.
  useEffect(() => {
    // Paint the document root + body the dark vault color so the whole canvas —
    // including the status-bar safe area and any overscroll bounce — stays dark.
    // The gradient itself is a fixed layer in the JSX (so it never "breaks" when
    // the content scrolls past the viewport).
    const html = document.documentElement;
    const prevHtml = html.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    html.style.backgroundColor = VAULT_DEEP;
    document.body.style.backgroundColor = VAULT_DEEP;
    return () => {
      html.style.backgroundColor = prevHtml;
      document.body.style.backgroundColor = prevBody;
    };
  }, []);

  const isGold = asset === "gold";
  const amount = parseAmountString(display);
  const usdCents = toUsdCents(amount, currency, lbpPerUsd);
  const grams = parseGrams(display);
  const canSave = (isGold ? grams > 0 : amount > 0) && !saving;

  function switchAsset(next: Asset) {
    setAsset(next);
    setDisplay("");
    setError(null);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const trimmedNote = note.trim();
    const noteValue = trimmedNote === "" ? null : trimmedNote;
    const { error: saveError } = isGold
      ? await addSafeGoldEntry({ is_deposit: isDeposit, grams, note: noteValue })
      : await addTransaction({
          // Adding to the safe leaves your balance → an expense (Out).
          // Taking it back comes in → income (In).
          is_income: !isDeposit,
          category: SAFE_CATEGORY_ID,
          amount_usd_cents: usdCents,
          original_currency: currency,
          original_amount: amount,
          rate_used: lbpPerUsd,
          note: noteValue,
        });

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setDisplay("");
    setNote("");
  }

  async function confirmDelete(run: () => Promise<unknown>) {
    if (window.confirm("Delete this safe movement?")) await run();
  }

  // Cash safe movements are the "safe"-category transactions; merge with gold.
  const cashMoves: Move[] = transactions
    .filter((t) => t.category === SAFE_CATEGORY_ID)
    .map((t: Transaction) => ({
      key: `cash-${t.id}`,
      kind: "cash",
      isDeposit: !t.is_income,
      occurredAt: t.occurred_at,
      note: t.note,
      cents: t.amount_usd_cents,
      isLbp: t.original_currency === "LBP",
      onDelete: () => confirmDelete(() => deleteTransaction(t.id)),
    }));
  const goldMoves: Move[] = safeGoldEntries.map((e: SafeGoldEntry) => ({
    key: `gold-${e.id}`,
    kind: "gold",
    isDeposit: e.is_deposit,
    occurredAt: e.occurred_at,
    note: e.note,
    grams: e.grams,
    onDelete: () => confirmDelete(() => deleteSafeGoldEntry(e.id)),
  }));
  const movements = [...cashMoves, ...goldMoves].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  const goldValueCents =
    goldPerGram != null ? Math.round(safeGoldGrams * goldPerGram * 100) : null;
  const enteredGoldValueCents =
    goldPerGram != null && grams > 0
      ? Math.round(grams * goldPerGram * 100)
      : null;

  const amountLabel = isGold
    ? formatGrams(grams)
    : currency === "USD"
      ? formatUsdCents(usdCents)
      : `${groupInt(display)} LBP`;
  const cta = saving
    ? "Saving…"
    : (isGold ? grams : amount) <= 0
      ? `Enter ${isGold ? "an amount of gold" : "an amount"}`
      : isDeposit
        ? `Add ${amountLabel} to safe`
        : `Take ${amountLabel} out`;

  const actionColor = isGold ? GOLD : isDeposit ? "#1FB85A" : "#E0631A";
  const actionText = isGold ? "#06281E" : "#FFFFFF";

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-white">
      {/* Fixed full-viewport vault gradient — stays put while content scrolls,
          and covers the status-bar area at the top. */}
      <div aria-hidden className="fixed inset-0" style={{ background: VAULT_BG, zIndex: -10 }} />

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

      {/* TOTALS — cash and gold in one vault card. */}
      <section>
        <div className="rounded-card bg-white/[0.06] px-5 py-6 ring-1 ring-white/10 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-white/55">
            <Vault className="h-4 w-4" strokeWidth={2} />
            In the safe
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            <Banknote className="h-3.5 w-3.5" strokeWidth={2} /> Cash
          </div>
          <p
            className="font-numeric text-4xl font-bold tabular-nums"
            style={{ color: safeTotalCents < 0 ? "#FF8A8A" : MINT }}
          >
            {formatSignedUsdCents(safeTotalCents)}
          </p>

          <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            <Coins className="h-3.5 w-3.5" strokeWidth={2} /> Gold
          </div>
          <p
            className="font-numeric text-4xl font-bold tabular-nums"
            style={{ color: GOLD }}
          >
            {formatGrams(safeGoldGrams)}
          </p>
          {goldValueCents != null ? (
            <p className="mt-0.5 text-xs text-white/45">
              ≈ {formatUsdCents(goldValueCents)} ·{" "}
              {formatUsdCents(Math.round((goldPerGram ?? 0) * 100))}/g (live)
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-white/30">
              Tracked in grams — live price unavailable.
            </p>
          )}

          <p className="mt-3 text-xs text-white/45">
            Cash here is moved out of your spendable balance; gold is tracked
            separately in grams.
          </p>
        </div>
      </section>

      {/* COMPOSER — choose cash or gold, then add to or take from the safe. */}
      <section className="flex flex-col gap-2">
        <h2 className="px-2 font-display text-sm font-semibold uppercase tracking-wide text-white/55">
          Move money
        </h2>
        <div className="flex flex-col gap-3 rounded-card bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur">
          {/* Cash / Gold asset selector. */}
          <div className="grid grid-cols-2 gap-1 rounded-pill bg-black/25 p-1">
            <button
              type="button"
              onClick={() => switchAsset("cash")}
              className={`press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                !isGold ? "bg-white/15 text-white shadow-segment" : "text-white/55"
              }`}
            >
              <Banknote className="h-4 w-4" strokeWidth={2.5} />
              Cash
            </button>
            <button
              type="button"
              onClick={() => switchAsset("gold")}
              className="press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition"
              style={
                isGold
                  ? { backgroundColor: GOLD, color: "#06281E" }
                  : { color: "rgba(255,255,255,0.55)" }
              }
            >
              <Coins className="h-4 w-4" strokeWidth={2.5} />
              Gold
            </button>
          </div>

          {/* Add / Take toggle. */}
          <div className="grid grid-cols-2 gap-1 rounded-pill bg-black/25 p-1">
            <button
              type="button"
              onClick={() => setIsDeposit(true)}
              className={`press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                isDeposit ? "shadow-segment" : "text-white/55"
              }`}
              style={isDeposit ? { backgroundColor: actionColor, color: actionText } : undefined}
            >
              <ArrowDownToLine className="h-4 w-4" strokeWidth={2.5} />
              Add
            </button>
            <button
              type="button"
              onClick={() => setIsDeposit(false)}
              className={`press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                !isDeposit ? "shadow-segment" : "text-white/55"
              }`}
              style={!isDeposit ? { backgroundColor: actionColor, color: actionText } : undefined}
            >
              <ArrowUpFromLine className="h-4 w-4" strokeWidth={2.5} />
              Take out
            </button>
          </div>

          {/* Amount (cash) or grams (gold). */}
          <div className="flex items-center gap-3 rounded-card border border-white/15 bg-black/15 px-4 py-3.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-bold"
              style={{ color: isGold ? GOLD : MINT }}
            >
              {isGold ? "g" : SYMBOL[currency]}
            </span>
            <input
              inputMode="decimal"
              value={display}
              onChange={(e) =>
                setDisplay(
                  isGold ? sanitizeGrams(e.target.value) : sanitizeAmount(e.target.value),
                )
              }
              placeholder={isGold ? "0" : "0.00"}
              aria-label={isGold ? "Grams" : "Amount"}
              className="min-w-0 flex-1 bg-transparent font-numeric text-3xl font-bold tabular-nums text-white outline-none placeholder:text-white/35"
            />
            {isGold ? (
              <span className="shrink-0 px-2 py-1 text-sm font-bold text-white/60">grams</span>
            ) : (
              <button
                type="button"
                onClick={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
                aria-label="Switch currency"
                className="press shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-white/70 active:bg-white/10"
              >
                {currency}
              </button>
            )}
          </div>
          {isGold && enteredGoldValueCents != null && (
            <p className="-mt-1 px-1 text-xs text-white/45">
              ≈ {formatUsdCents(enteredGoldValueCents)} at the live price
            </p>
          )}
          {!isGold && currency === "LBP" && amount > 0 && (
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
                ? { backgroundColor: actionColor, color: actionText }
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

      {/* HISTORY — cash and gold movements together. */}
      <section className="flex flex-col gap-2">
        <h2 className="px-2 font-display text-sm font-semibold uppercase tracking-wide text-white/55">
          Safe history
        </h2>
        {movements.length === 0 ? (
          <p className="py-10 text-center text-white/45">
            Nothin' in the safe yet, Doc. Add some above.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {movements.map((m) => {
              const tone = m.kind === "gold" ? GOLD : m.isDeposit ? MINT : TAKE;
              const right =
                m.kind === "gold"
                  ? `${m.isDeposit ? "+" : "-"}${formatGrams(m.grams ?? 0)}`
                  : `${m.isDeposit ? "+" : "-"}${formatUsdCents(m.cents ?? 0)}`;
              const Icon =
                m.kind === "gold"
                  ? Coins
                  : m.isDeposit
                    ? ArrowDownToLine
                    : ArrowUpFromLine;
              return (
                <li
                  key={m.key}
                  className="flex items-center gap-3 rounded-card bg-white/[0.06] px-4 py-3.5 ring-1 ring-white/10"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-white/10"
                    style={{ color: tone }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">
                      {m.isDeposit ? "Added" : "Took out"}
                      {m.kind === "gold" ? " gold" : " cash"}
                    </p>
                    {m.note && (
                      <p className="truncate text-xs text-white/50">{m.note}</p>
                    )}
                    <p className="text-xs text-white/50">
                      {dateLabel(m.occurredAt)}
                      {m.kind === "cash" && m.isLbp && " · LBP"}
                    </p>
                  </div>
                  <span
                    className="font-numeric font-medium tabular-nums"
                    style={{ color: tone }}
                  >
                    {right}
                  </span>
                  <button
                    type="button"
                    onClick={() => void m.onDelete()}
                    aria-label="Delete"
                    className="press -m-1 ml-1 p-1 text-white/45"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
