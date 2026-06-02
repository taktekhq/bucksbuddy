import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Delete } from "lucide-react";
import { InOutToggle } from "@/components/ui/InOutToggle";
import { useStore } from "@/lib/store";
import {
  categoriesFor,
  categoryColor,
  categoryIcon,
  categoryLabel,
} from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { amountColorClass, formatUsdCents } from "@/lib/money";
import { applyKey, buzz, HOLD_MS } from "@/lib/keypad";
import type { Transaction } from "@/types/db";

const SLOTS = 15; // 3 × 5 phone-dial grid
const INCOME_COLOR = "#34C759";
const EXPENSE_COLOR = "#FF3B30";

type Phase = "category" | "amount";

function groupInt(s: string): string {
  const [i, d] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d !== undefined ? `${grouped}.${d}` : grouped;
}

// Shared circle shape for every key on the dial.
const CIRCLE =
  "press flex aspect-square flex-col items-center justify-center gap-0.5 rounded-full transition";

export function AddComposer({
  editing,
  onClearEdit,
}: {
  editing: Transaction | null;
  onClearEdit: () => void;
}) {
  const { lbpPerUsd, addTransaction, updateTransaction } = useStore();
  const [phase, setPhase] = useState<Phase>("category");
  const [isIncome, setIsIncome] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [display, setDisplay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  // Editing jumps straight to amount entry with the pick loaded; otherwise we
  // always start on the category step.
  useEffect(() => {
    if (editing) {
      setIsIncome(editing.is_income);
      setCategory(editing.category);
      setCurrency(editing.original_currency);
      setDisplay(String(editing.original_amount));
      setPhase("amount");
      setError(null);
    } else {
      setIsIncome(false);
      setCategory(null);
      setCurrency("USD");
      setDisplay("");
      setPhase("category");
      setError(null);
    }
  }, [editing]);

  const amount = parseAmountString(display);
  const usdCents = toUsdCents(amount, currency, lbpPerUsd);
  const canSave = category !== null && amount > 0 && !saving;
  const dirColor = isIncome ? INCOME_COLOR : EXPENSE_COLOR;

  function press(k: string) {
    buzz();
    setDisplay((d) => applyKey(d, k));
  }

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

  // In the category step the toggle switches lists (clearing the pick).
  function changeDirection(next: boolean) {
    setIsIncome(next);
    setCategory(null);
  }

  // In the amount step the direction circle flips direction; if the current
  // pick isn't valid for the new list, bounce back to re-pick.
  function flipDirection() {
    const next = !isIncome;
    setIsIncome(next);
    if (!categoriesFor(next).some((c) => c.id === category)) {
      setCategory(null);
      setPhase("category");
    }
  }

  function pickCategory(id: string) {
    setCategory(id);
    setPhase("amount");
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
      // Reset for the next quick entry — back to the category step.
      setDisplay("");
      setCategory(null);
      setPhase("category");
    }
  }

  const sub = currency === "LBP" ? `≈ ${formatUsdCents(usdCents)}` : " ";
  const bigAmount =
    currency === "USD"
      ? `$${groupInt(display === "" ? "0" : display)}`
      : `${groupInt(display === "" ? "0" : display)} LBP`;
  const amountTint =
    display === "" ? "text-label-secondary" : amountColorClass(isIncome);

  // ---- Category step: 15 circles, real categories first, rest greyed. ----
  if (phase === "category") {
    const cats = categoriesFor(isIncome);
    return (
      <div className="px-4 pb-6 pt-5">
        <InOutToggle isIncome={isIncome} onChange={changeDirection} />
        <p className="mt-3 text-center text-sm text-label-secondary">
          Pick a category
        </p>
        <div className="mx-auto mt-4 grid w-full max-w-[19rem] grid-cols-3 gap-3">
          {Array.from({ length: SLOTS }).map((_, i) => {
            const c = cats[i];
            if (!c) {
              return (
                <div key={i} className="aspect-square rounded-full bg-grouped/50" />
              );
            }
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCategory(c.id)}
                className={`${CIRCLE} active:brightness-95`}
                style={{ backgroundColor: `${c.color}1A` }}
              >
                <Icon className="h-6 w-6" strokeWidth={2} style={{ color: c.color }} />
                <span
                  className="text-[10px] font-medium leading-tight"
                  style={{ color: c.color }}
                >
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
        {editing && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onClearEdit}
              className="press py-2 text-sm text-carrot"
            >
              Cancel edit
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Amount step: the picked category chip + amount, then the phone dial. ----
  const ChipIcon = categoryIcon(category!);
  const chipColor = categoryColor(category!);

  return (
    <div className="px-4 pb-6 pt-5">
      <div className="text-center">
        <button
          type="button"
          onClick={() => setPhase("category")}
          className="press mb-2 inline-flex items-center gap-1.5 rounded-pill px-3 py-1"
          style={{ backgroundColor: `${chipColor}1A` }}
        >
          <ChipIcon className="h-4 w-4" strokeWidth={2} style={{ color: chipColor }} />
          <span className="text-sm font-medium" style={{ color: chipColor }}>
            {categoryLabel(category!)}
          </span>
        </button>
        <div className={`font-numeric text-5xl font-black tabular-nums ${amountTint}`}>
          {bigAmount}
        </div>
        <div className="mt-1 h-4 text-sm text-label-secondary">{sub}</div>
      </div>

      <div className="mx-auto mt-4 grid w-full max-w-[19rem] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={`${CIRCLE} bg-grouped font-numeric text-2xl font-bold tabular-nums text-label active:bg-carrot-soft`}
          >
            {k}
          </button>
        ))}

        {/* Currency toggle ($ ⇄ LBP). */}
        <button
          type="button"
          onClick={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
          className={`${CIRCLE} bg-grouped text-carrot-dark active:bg-carrot-soft`}
        >
          <span className="text-base font-bold">{currency}</span>
        </button>

        {/* Direction (flip Out/In). */}
        <button
          type="button"
          onClick={flipDirection}
          aria-label={isIncome ? "Money in" : "Money out"}
          className={CIRCLE}
          style={{ backgroundColor: `${dirColor}1A` }}
        >
          {isIncome ? (
            <ArrowUp className="h-5 w-5" strokeWidth={2.5} style={{ color: dirColor }} />
          ) : (
            <ArrowDown className="h-5 w-5" strokeWidth={2.5} style={{ color: dirColor }} />
          )}
          <span className="text-[11px] font-bold" style={{ color: dirColor }}>
            {isIncome ? "IN" : "OUT"}
          </span>
        </button>

        {/* Save. */}
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          aria-label={editing ? "Save changes" : "Add entry"}
          className={`${CIRCLE} ${
            canSave ? "bg-carrot text-white" : "bg-grouped text-label-secondary"
          }`}
        >
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </button>

        {/* Backspace (hold to clear). */}
        <button
          type="button"
          aria-label="Delete (hold to clear)"
          onPointerDown={startBackspaceHold}
          onPointerUp={endBackspaceHold}
          onPointerLeave={cancelBackspaceHold}
          onPointerCancel={cancelBackspaceHold}
          onContextMenu={(e) => e.preventDefault()}
          className={`${CIRCLE} bg-grouped text-carrot-dark active:bg-carrot-soft`}
        >
          <Delete className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>

      {error && (
        <p className="mt-3 text-center text-sm font-medium text-danger">{error}</p>
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
    </div>
  );
}
