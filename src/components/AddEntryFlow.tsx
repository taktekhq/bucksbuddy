import { useState } from "react";
import { InOutToggle } from "@/components/ui/InOutToggle";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import { CurrencyToggle } from "@/components/ui/CurrencyToggle";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { Numpad, applyKey } from "@/components/ui/Numpad";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { categoriesFor } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";

export function AddEntryFlow() {
  const { lbpPerUsd, addTransaction } = useStore();
  const [isIncome, setIsIncome] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [display, setDisplay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmountString(display);
  const canSave = category !== null && amount > 0 && !saving;

  // Income and expense have different category sets, so reset the pick on toggle.
  function changeDirection(next: boolean) {
    setIsIncome(next);
    setCategory(null);
  }

  async function save() {
    if (!canSave || category === null) return;
    setSaving(true);
    setError(null);

    const { error: saveError } = await addTransaction({
      is_income: isIncome,
      category,
      amount_usd_cents: toUsdCents(amount, currency, lbpPerUsd),
      original_currency: currency,
      original_amount: amount,
      rate_used: lbpPerUsd,
    });

    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    navigate("/");
  }

  return (
    <div className="flex min-h-full flex-col px-5 pb-[calc(1rem+var(--safe-bottom))] pt-[calc(0.5rem+var(--safe-top))]">
      <header className="flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="press -m-2 p-2 text-base text-carrot"
        >
          Cancel
        </button>
        <h1 className="text-base font-semibold">New Entry</h1>
        <span className="w-12" />
      </header>

      {/* Amount first — the thing you most want to type the moment you open. */}
      <div className="mt-3 flex flex-col items-center gap-3">
        <AmountDisplay display={display} currency={currency} lbpPerUsd={lbpPerUsd} />
        <CurrencyToggle currency={currency} onChange={setCurrency} />
      </div>

      {/* Direction directly below the amount. */}
      <div className="mt-5">
        <InOutToggle isIncome={isIncome} onChange={changeDirection} />
      </div>

      {/* Categories change with direction (income vs expense). */}
      <div className="mt-4">
        <CategoryGrid
          categories={categoriesFor(isIncome)}
          selected={category}
          onSelect={setCategory}
        />
      </div>

      <div className="mt-auto pt-5">
        <Numpad onPress={(k) => setDisplay((d) => applyKey(d, k))} />

        {error && <p className="mt-3 text-center text-sm text-expense">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={`press mt-3 w-full rounded-card py-4 text-lg font-semibold text-white ${
            canSave ? "bg-label" : "bg-separator"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
