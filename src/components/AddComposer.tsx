import { useEffect, useRef, useState } from "react";
import { Check, Delete, Tag } from "lucide-react";
import { CurrencyToggle } from "@/components/ui/CurrencyToggle";
import { CategorySheet } from "@/components/ui/CategorySheet";
import { useStore } from "@/lib/store";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { amountColorClass, formatUsdCents } from "@/lib/money";
import { applyKey, buzz, HOLD_MS } from "@/lib/keypad";
import type { Transaction } from "@/types/db";

function groupInt(s: string): string {
  const [i, d] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d !== undefined ? `${grouped}.${d}` : grouped;
}

// A single digit / "." key on the dialer.
function DialerKey({
  k,
  onPress,
}: {
  k: string;
  onPress: (k: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPress(k)}
      className="press rounded-card bg-grouped py-4 font-numeric text-2xl font-bold tabular-nums text-label transition active:bg-carrot-soft"
    >
      {k}
    </button>
  );
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

  // Long-press state for the ⌫ key (hold to clear the whole amount).
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  // Load a transaction into the composer when editing starts; reset when cleared.
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

  function press(k: string) {
    buzz();
    setDisplay((d) => applyKey(d, k));
  }

  // ⌫: tap deletes one char; hold (~400ms) clears the whole amount.
  function startBackspaceHold() {
    longFired.current = false;
    holdTimer.current = setTimeout(() => {
      longFired.current = true;
      buzz(20);
      setDisplay("");
    }, HOLD_MS);
  }
  function endBackspaceHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (!longFired.current) {
      buzz();
      setDisplay((d) => applyKey(d, "⌫"));
    }
    longFired.current = false;
  }
  function cancelBackspaceHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    longFired.current = false;
  }

  function changeDirection(next: boolean) {
    // Income and expense have different lists, so a direction flip clears the pick.
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
      // Reset for the next quick entry.
      setDisplay("");
      setCategory(null);
    }
  }

  const sub = currency === "LBP" ? `≈ ${formatUsdCents(usdCents)}` : " ";
  const bigAmount =
    currency === "USD"
      ? `$${groupInt(display === "" ? "0" : display)}`
      : `${groupInt(display === "" ? "0" : display)} LBP`;

  // Neutral until a direction is committed (via the category), then green/red.
  const amountTint =
    display === ""
      ? "text-label-secondary"
      : category
        ? amountColorClass(isIncome)
        : "text-label";

  const SelectedIcon = category ? categoryIcon(category) : null;

  return (
    <div className="pb-3">
      {/* AMOUNT — dialer-style, centered. */}
      <div className="px-4 pt-6 pb-3 text-center">
        <div className={`font-numeric text-5xl font-extrabold tabular-nums ${amountTint}`}>
          {bigAmount}
        </div>
        <div className="mt-1 h-4 text-sm text-label-secondary">{sub}</div>
      </div>

      {/* KEYPAD — 1-9, then . 0 [Category]. */}
      <div className="grid grid-cols-3 gap-2 px-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((k) => (
          <DialerKey key={k} k={k} onPress={press} />
        ))}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="press flex flex-col items-center justify-center gap-0.5 rounded-card bg-grouped py-4 transition"
          style={category ? { backgroundColor: `${categoryColor(category)}1A` } : undefined}
        >
          {category && SelectedIcon ? (
            <>
              <SelectedIcon
                className="h-5 w-5"
                strokeWidth={2}
                style={{ color: categoryColor(category) }}
              />
              <span
                className="text-[10px] font-medium leading-tight"
                style={{ color: categoryColor(category) }}
              >
                {categoryLabel(category)}
              </span>
            </>
          ) : (
            <>
              <Tag className="h-5 w-5 text-label-secondary" strokeWidth={2} />
              <span className="text-[10px] font-medium leading-tight text-label-secondary">
                Category
              </span>
            </>
          )}
        </button>
      </div>

      {/* UTILITY ROW — currency toggle · save · backspace. */}
      <div className="mt-3 flex items-center justify-between px-4">
        <CurrencyToggle currency={currency} onChange={setCurrency} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            aria-label={editing ? "Save changes" : "Add entry"}
            className={`press flex h-14 w-14 items-center justify-center rounded-full transition ${
              canSave
                ? "bg-carrot text-white shadow-carrot"
                : "bg-separator text-label-secondary"
            }`}
          >
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Delete (hold to clear)"
            onPointerDown={startBackspaceHold}
            onPointerUp={endBackspaceHold}
            onPointerLeave={cancelBackspaceHold}
            onPointerCancel={cancelBackspaceHold}
            onContextMenu={(e) => e.preventDefault()}
            className="press flex h-14 w-14 items-center justify-center rounded-full bg-grouped text-carrot-dark transition active:bg-carrot-soft"
          >
            <Delete className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 px-4 text-center text-sm font-medium text-danger">{error}</p>
      )}
      {editing && (
        <div className="mt-1 text-center">
          <button
            type="button"
            onClick={onClearEdit}
            className="press py-2 text-sm text-carrot"
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
