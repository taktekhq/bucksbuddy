import { useEffect, useState } from "react";
import { ChevronRight, StickyNote, Tag } from "lucide-react";
import { CategorySheet } from "@/components/ui/CategorySheet";
import { useStore } from "@/lib/store";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import {
  currencySymbol,
  parseAmountString,
  toHomeCents,
  type Currency,
  type CurrencyRate,
} from "@/lib/currency";
import { formatCents } from "@/lib/money";
import posthog from "@/lib/posthog";
import type { Transaction } from "@/types/db";

const INCOME_COLOR = "#34C759";
const EXPENSE_COLOR = "#FF3B30";

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
  const { homeCurrency, currencies, addTransaction, updateTransaction } = useStore();
  const [isIncome, setIsIncome] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>(homeCurrency);
  const [display, setDisplay] = useState("");
  const [note, setNote] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only `editing` drives this reset: the home currency is read at that
  // moment, not watched, so a settings refresh landing mid-typing can't wipe
  // the form. (A stale pick is folded back to home by `selected` below.)
  useEffect(() => {
    if (editing) {
      setIsIncome(editing.is_income);
      setCategory(editing.category);
      setCurrency(editing.original_currency);
      setDisplay(String(editing.original_amount));
      setNote(editing.note ?? "");
      setError(null);
    } else {
      setIsIncome(false);
      setCategory(null);
      setCurrency(homeCurrency);
      setDisplay("");
      setNote("");
      setError(null);
    }
    setSheetOpen(false);
  }, [editing]);

  // The currencies on offer: home first (rate 1), then the secondaries from
  // Settings. Editing an entry typed in a currency that has since been removed
  // keeps that currency available, at the rate the entry was saved with, so
  // the edit doesn't silently change what was typed.
  const choices: CurrencyRate[] = [{ code: homeCurrency, rate: 1 }, ...currencies];
  if (editing && !choices.some((c) => c.code === editing.original_currency)) {
    choices.push({ code: editing.original_currency, rate: editing.rate_used });
  }
  const selected = choices.find((c) => c.code === currency) ?? choices[0];
  const isHome = selected.code === homeCurrency;

  const amount = parseAmountString(display);
  const cents = toHomeCents(amount, selected.rate);
  const canSave = category !== null && amount > 0 && !saving;

  function cycleCurrency() {
    const i = choices.findIndex((c) => c.code === selected.code);
    setCurrency(choices[(i + 1) % choices.length].code);
  }

  function changeDirection(next: boolean) {
    setIsIncome(next);
    setCategory(null);
  }

  function pickCategory(id: string) {
    setCategory(id);
    setSheetOpen(false);
  }

  async function save() {
    // Defensive guard: the CTA is disabled unless canSave, so this never
    // returns in practice — it's here for safety and to narrow `category`.
    /* v8 ignore start */
    if (!canSave || category === null) return;
    /* v8 ignore stop */
    setSaving(true);
    setError(null);

    const trimmedNote = note.trim();
    const payload = {
      is_income: isIncome,
      category,
      amount_usd_cents: cents,
      original_currency: selected.code,
      original_amount: amount,
      rate_used: selected.rate,
      note: trimmedNote === "" ? null : trimmedNote,
    };

    const { error: saveError } = editing
      ? await updateTransaction(editing.id, payload)
      : await addTransaction(payload);

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    if (editing) {
      posthog.capture("transaction_updated", {
        category,
        is_income: isIncome,
        currency: selected.code,
      });
      onClearEdit();
    }
    else {
      posthog.capture("transaction_added", {
        category,
        is_income: isIncome,
        currency: selected.code,
      });
      setDisplay("");
      setCategory(null);
      setNote("");
    }
  }

  const SelectedIcon = category ? categoryIcon(category) : null;
  const catColor = category ? categoryColor(category) : "#8E8E93";
  const dirColor = isIncome ? INCOME_COLOR : EXPENSE_COLOR;

  const amountLabel = isHome
    ? formatCents(cents, homeCurrency)
    : `${groupInt(display)} ${selected.code}`;
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
      <div className="flex items-center gap-3 rounded-card border border-separator px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-carrot-soft text-base font-bold text-carrot">
          {currencySymbol(selected.code)}
        </span>
        <input
          inputMode="decimal"
          value={groupInt(display)}
          onChange={(e) => setDisplay(sanitizeAmount(e.target.value))}
          placeholder="0.00"
          aria-label="Amount"
          className="min-w-0 flex-1 bg-transparent font-numeric text-3xl font-bold tabular-nums text-label outline-none placeholder:text-label-secondary"
        />
        {/* Tap to cycle through the currencies from Settings; with only the
            home currency set up there's nothing to switch to. */}
        {choices.length > 1 ? (
          <button
            type="button"
            onClick={cycleCurrency}
            aria-label="Switch currency"
            className="press shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-label-secondary active:bg-grouped"
          >
            {selected.code}
          </button>
        ) : (
          <span className="shrink-0 px-2 py-1 text-sm font-bold text-label-secondary">
            {selected.code}
          </span>
        )}
      </div>
      {!isHome && amount > 0 && (
        <p className="-mt-1 px-1 text-xs text-label-secondary">
          ≈ {formatCents(cents, homeCurrency)}
        </p>
      )}

      {/* CATEGORY — wide card; opens the sheet. Shows the pick + direction. */}
      {category && SelectedIcon ? (
        <div className="flex items-center gap-3 rounded-card border border-separator px-4 py-3">
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

      {/* NOTE — optional, available once a category is chosen. */}
      {category && (
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
