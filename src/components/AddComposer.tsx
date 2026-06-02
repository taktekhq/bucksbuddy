import { useEffect, useState } from "react";
import { ChevronRight, Tag } from "lucide-react";
import { CategorySheet } from "@/components/ui/CategorySheet";
import { useStore } from "@/lib/store";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatUsdCents } from "@/lib/money";
import type { Transaction } from "@/types/db";

const INCOME_COLOR = "#34C759";
const EXPENSE_COLOR = "#FF3B30";
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

export function AddComposer({
  editing,
  onClearEdit,
}: {
  editing: Transaction | null;
  onClearEdit: () => void;
}) {
  const { lbpPerUsd, addTransaction, updateTransaction } = useStore();
  const [isIncome, setIsIncome] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [display, setDisplay] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setIsIncome(editing.is_income);
      setCategory(editing.category);
      setCurrency(editing.original_currency);
      setDisplay(String(editing.original_amount));
      setError(null);
    } else {
      setIsIncome(false);
      setCategory(null);
      setCurrency("USD");
      setDisplay("");
      setError(null);
    }
    setSheetOpen(false);
  }, [editing]);

  const amount = parseAmountString(display);
  const usdCents = toUsdCents(amount, currency, lbpPerUsd);
  const canSave = category !== null && amount > 0 && !saving;

  function changeDirection(next: boolean) {
    setIsIncome(next);
    setCategory(null);
  }

  function pickCategory(id: string) {
    setCategory(id);
    setSheetOpen(false);
  }

  async function save() {
    if (!canSave || category === null) return;
    setSaving(true);
    setError(null);

    const payload = {
      is_income: isIncome,
      category,
      amount_usd_cents: usdCents,
      original_currency: currency,
      original_amount: amount,
      rate_used: lbpPerUsd,
    };

    const { error: saveError } = editing
      ? await updateTransaction(editing.id, payload)
      : await addTransaction(payload);

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    if (editing) onClearEdit();
    else {
      setDisplay("");
      setCategory(null);
    }
  }

  const SelectedIcon = category ? categoryIcon(category) : null;
  const catColor = category ? categoryColor(category) : "#8E8E93";
  const dirColor = isIncome ? INCOME_COLOR : EXPENSE_COLOR;

  const amountLabel =
    currency === "USD" ? formatUsdCents(usdCents) : `${groupInt(display)} LBP`;
  const cta = saving
    ? "Saving…"
    : !canSave
      ? amount <= 0
        ? "Enter an amount"
        : "Choose a category"
      : `${editing ? "Save" : "Add"} ${amountLabel}`;

  return (
    <div className="flex flex-col gap-3 px-4 pb-5 pt-4">
      {/* AMOUNT — always visible, edited with the native keyboard. */}
      <div className="flex items-center gap-3 rounded-card bg-grouped px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-carrot-soft text-base font-bold text-carrot">
          {SYMBOL[currency]}
        </span>
        <input
          inputMode="decimal"
          value={display}
          onChange={(e) => setDisplay(sanitizeAmount(e.target.value))}
          placeholder="0.00"
          aria-label="Amount"
          className="min-w-0 flex-1 bg-transparent font-numeric text-3xl font-bold tabular-nums text-label-muted outline-none placeholder:text-label-secondary"
        />
        <button
          type="button"
          onClick={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
          aria-label="Switch currency"
          className="press shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-label-secondary active:bg-surface"
        >
          {currency}
        </button>
      </div>
      {currency === "LBP" && amount > 0 && (
        <p className="-mt-1 px-1 text-xs text-label-secondary">
          ≈ {formatUsdCents(usdCents)}
        </p>
      )}

      {/* CATEGORY — wide card; opens the sheet. Shows the pick + direction. */}
      {category && SelectedIcon ? (
        <div className="flex items-center gap-3 rounded-card bg-grouped px-4 py-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: catColor }}
          >
            <SelectedIcon className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: dirColor }}
            >
              {isIncome ? "Income" : "Expense"}
            </div>
            <div className="truncate font-bold text-label">
              {categoryLabel(category)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="press shrink-0 rounded-pill border border-carrot px-3 py-1 text-sm font-semibold text-carrot"
          >
            Change ›
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="press flex w-full items-center gap-3 rounded-card border border-dashed border-carrot/40 bg-carrot-soft/40 px-4 py-3.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-carrot-soft text-carrot">
            <Tag className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="text-left">
            <div className="font-bold text-label">Add Category</div>
            <div className="text-sm text-label-secondary">Income or expense</div>
          </div>
          <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-label-secondary" strokeWidth={2} />
        </button>
      )}

      {/* CTA — contextual, shows the amount when ready. */}
      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className={`press mt-1 w-full rounded-pill py-3.5 text-lg font-semibold text-white transition ${
          canSave ? "bg-carrot" : "bg-separator text-label-secondary"
        }`}
      >
        {cta}
      </button>

      {error && (
        <p className="text-center text-sm font-medium text-danger">{error}</p>
      )}
      {editing && (
        <div className="text-center">
          <button
            type="button"
            onClick={onClearEdit}
            className="press py-1 text-sm text-carrot"
          >
            Cancel edit
          </button>
        </div>
      )}

      <CategorySheet
        open={sheetOpen}
        isIncome={isIncome}
        selected={category}
        onChangeDirection={changeDirection}
        onSelect={pickCategory}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
