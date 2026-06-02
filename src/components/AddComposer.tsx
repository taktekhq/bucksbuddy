import { useEffect, useRef, useState } from "react";
import { ChevronRight, Delete } from "lucide-react";
import { CategorySheet } from "@/components/ui/CategorySheet";
import { useStore } from "@/lib/store";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { amountColorClass, formatUsdCents } from "@/lib/money";
import { applyKey, buzz, HOLD_MS } from "@/lib/keypad";
import type { Transaction } from "@/types/db";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

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

  // Backspace: a plain onClick deletes one char (reliable on touch); a long
  // press clears everything and suppresses the click that follows.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearedByHold = useRef(false);

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

  function backspaceDown() {
    clearedByHold.current = false;
    holdTimer.current = setTimeout(() => {
      clearedByHold.current = true;
      buzz(20);
      setDisplay("");
    }, HOLD_MS);
  }
  function backspaceUp() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }
  function backspaceClick() {
    if (clearedByHold.current) {
      clearedByHold.current = false;
      return; // the hold already cleared; ignore this tap
    }
    buzz();
    setDisplay((d) => applyKey(d, "⌫"));
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

  const sub = currency === "LBP" ? `≈ ${formatUsdCents(usdCents)}` : " ";
  const bigAmount =
    currency === "USD"
      ? `$${groupInt(display === "" ? "0" : display)}`
      : `${groupInt(display === "" ? "0" : display)} LBP`;
  const amountTint =
    display === ""
      ? "text-label-secondary"
      : category
        ? amountColorClass(isIncome)
        : "text-label";

  const SelectedIcon = category ? categoryIcon(category) : null;

  return (
    <div className="px-4 pb-6 pt-4">
      {/* Currency toggle, quiet, top-right. */}
      <div className="flex justify-end">
        <div className="inline-grid grid-cols-2 gap-1 rounded-pill bg-grouped p-1 text-xs font-semibold">
          {(["USD", "LBP"] as Currency[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`press rounded-pill px-3 py-1 transition ${
                currency === c
                  ? "bg-surface text-carrot shadow-segment"
                  : "text-label-secondary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Money first — the amount is the hero of this screen. */}
      <div className="mt-1 text-center">
        <div className={`font-numeric text-5xl font-bold tabular-nums ${amountTint}`}>
          {bigAmount}
        </div>
        <div className="mt-1 h-4 text-sm text-label-secondary">{sub}</div>
      </div>

      {/* Keypad — quiet keys, press fills grey. */}
      <div className="mx-auto mt-4 grid max-w-[18rem] grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="press rounded-2xl py-3.5 font-numeric text-2xl font-medium tabular-nums text-label transition active:bg-grouped"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete (hold to clear)"
          onPointerDown={backspaceDown}
          onPointerUp={backspaceUp}
          onPointerLeave={backspaceUp}
          onPointerCancel={backspaceUp}
          onClick={backspaceClick}
          onContextMenu={(e) => e.preventDefault()}
          className="press flex items-center justify-center rounded-2xl py-3.5 text-label-secondary transition active:bg-grouped"
        >
          <Delete className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>

      {/* Category — an iOS form row that opens the picker sheet. */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="press mt-4 flex w-full items-center justify-between rounded-card bg-grouped px-4 py-3.5"
      >
        <span className="text-base text-label">Category</span>
        <span className="flex items-center gap-1.5 text-base">
          {category && SelectedIcon ? (
            <>
              <SelectedIcon
                className="h-4 w-4"
                strokeWidth={2}
                style={{ color: categoryColor(category) }}
              />
              <span className="font-medium" style={{ color: categoryColor(category) }}>
                {categoryLabel(category)}
              </span>
            </>
          ) : (
            <span className="text-label-secondary">Choose</span>
          )}
          <ChevronRight className="h-4 w-4 text-label-secondary" strokeWidth={2} />
        </span>
      </button>

      {/* Save. */}
      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className={`press mt-3 w-full rounded-pill py-3.5 text-lg font-semibold text-white transition ${
          canSave ? "bg-carrot" : "bg-separator text-label-secondary"
        }`}
      >
        {saving ? "Saving…" : editing ? "Save" : "Add"}
      </button>

      {error && (
        <p className="mt-2 text-center text-sm font-medium text-danger">{error}</p>
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
