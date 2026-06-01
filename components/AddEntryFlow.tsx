"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InOutToggle } from "@/components/ui/InOutToggle";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import { CurrencyToggle } from "@/components/ui/CurrencyToggle";
import { AmountDisplay } from "@/components/ui/AmountDisplay";
import { Numpad, applyKey } from "@/components/ui/Numpad";
import { createClient } from "@/lib/supabase/client";
import {
  type Currency,
  parseAmountString,
  toUsdCents,
} from "@/lib/currency";

type Props = {
  lbpPerUsd: number;
};

export function AddEntryFlow({ lbpPerUsd }: Props) {
  const router = useRouter();
  const [isIncome, setIsIncome] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [display, setDisplay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmountString(display);
  const canSave = category !== null && amount > 0 && !saving;

  async function save() {
    if (!canSave || category === null) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: user.id,
      is_income: isIncome,
      category,
      amount_usd_cents: toUsdCents(amount, currency, lbpPerUsd),
      original_currency: currency,
      original_amount: amount,
      rate_used: lbpPerUsd,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-[calc(1rem+var(--safe-bottom))] pt-[calc(0.5rem+var(--safe-top))]">
      <header className="flex items-center justify-between py-2">
        <Link href="/" prefetch className="press -m-2 p-2 text-base text-carrot">
          Cancel
        </Link>
        <h1 className="text-base font-semibold">New Entry</h1>
        <span className="w-12" />
      </header>

      <div className="mt-2">
        <InOutToggle isIncome={isIncome} onChange={setIsIncome} />
      </div>

      <div className="mt-5">
        <CategoryGrid selected={category} onSelect={setCategory} />
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <CurrencyToggle currency={currency} onChange={setCurrency} />
        <AmountDisplay
          display={display}
          currency={currency}
          lbpPerUsd={lbpPerUsd}
        />
      </div>

      <div className="mt-auto pt-6">
        <Numpad onPress={(k) => setDisplay((d) => applyKey(d, k))} />

        {error && (
          <p className="mt-3 text-center text-sm text-expense">{error}</p>
        )}

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
