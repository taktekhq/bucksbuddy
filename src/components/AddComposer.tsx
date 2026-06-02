import { useEffect, useState } from "react";
import { InOutToggle } from "@/components/ui/InOutToggle";
import { CurrencyToggle } from "@/components/ui/CurrencyToggle";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import { Numpad, applyKey } from "@/components/ui/Numpad";
import { useStore } from "@/lib/store";
import {
  categoriesFor,
  categoryColor,
  categoryIcon,
  categoryLabel,
} from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { amountColorClass, formatUsdCents } from "@/lib/money";
import type { Transaction } from "@/types/db";

type Section = "amount" | "category" | null;

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
  // Collapsed by default — the numpad only opens when the amount is tapped.
  const [expanded, setExpanded] = useState<Section>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load a transaction into the composer when editing starts; reset when cleared.
  useEffect(() => {
    if (editing) {
      setIsIncome(editing.is_income);
      setCategory(editing.category);
      setCurrency(editing.original_currency);
      setDisplay(String(editing.original_amount));
      setExpanded("amount");
      setError(null);
    } else {
      setIsIncome(false);
      setCategory(null);
      setCurrency("USD");
      setDisplay("");
      setExpanded(null);
      setError(null);
    }
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
    setExpanded(null);
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
      // Reset for the next quick entry — collapsed again.
      setDisplay("");
      setCategory(null);
      setExpanded(null);
    }
  }

  const sub = currency === "LBP" ? `≈ ${formatUsdCents(usdCents)}` : " ";
  const bigAmount =
    currency === "USD"
      ? `$${groupInt(display === "" ? "0" : display)}`
      : `${groupInt(display === "" ? "0" : display)} LBP`;

  const SelectedIcon = category ? categoryIcon(category) : null;

  return (
    <div>
      {/* AMOUNT — tap to expand currency + numpad; collapsed shows just the number. */}
      <button
        type="button"
        onClick={() => setExpanded(expanded === "amount" ? null : "amount")}
        className="press flex w-full flex-col items-center gap-0.5 px-4 pt-6 pb-3"
      >
        <span
          className={`font-numeric text-4xl font-extrabold tabular-nums ${
            display === "" ? "text-label-secondary" : amountColorClass(isIncome)
          }`}
        >
          {bigAmount}
        </span>
        <span className="h-4 text-sm text-label-secondary">{sub}</span>
      </button>

      {expanded === "amount" && (
        <div className="flex flex-col items-center gap-3 px-4 pb-4">
          <CurrencyToggle currency={currency} onChange={setCurrency} />
          <div className="w-full">
            <Numpad onPress={(k) => setDisplay((d) => applyKey(d, k))} />
          </div>
        </div>
      )}

      {/* IN / OUT — always visible. */}
      <div className="px-4 py-2">
        <InOutToggle isIncome={isIncome} onChange={changeDirection} />
      </div>

      {/* CATEGORY — collapsed shows the pick; expands to the grid. */}
      <button
        type="button"
        onClick={() => setExpanded(expanded === "category" ? null : "category")}
        className="press flex w-full items-center justify-between px-4 py-3.5"
      >
        <span className="text-base font-medium">Category</span>
        <span className="flex items-center gap-1.5 text-base text-label-secondary">
          {SelectedIcon && category && (
            <SelectedIcon
              className="h-4 w-4"
              strokeWidth={1.75}
              style={{ color: categoryColor(category) }}
            />
          )}
          {category ? categoryLabel(category) : "Choose"}
        </span>
      </button>

      {expanded === "category" && (
        <div className="px-4 pb-5">
          <CategoryGrid
            categories={categoriesFor(isIncome)}
            selected={category}
            onSelect={pickCategory}
          />
        </div>
      )}

      <div className="flex flex-col items-center px-4 pb-6 pt-1">
        {error && <p className="mb-2 text-center text-sm font-medium text-danger">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={`press rounded-pill px-12 py-3.5 font-display text-lg font-semibold uppercase text-white transition ${
            canSave
              ? "bg-carrot shadow-carrot"
              : "bg-separator text-label-secondary shadow-none"
          }`}
        >
          {saving ? "Saving…" : editing ? "Save" : "Add"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onClearEdit}
            className="press mt-2 py-2 text-center text-sm text-carrot"
          >
            Cancel edit
          </button>
        )}
      </div>
    </div>
  );
}
