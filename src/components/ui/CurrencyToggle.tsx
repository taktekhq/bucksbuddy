import type { Currency } from "@/lib/currency";

type Props = {
  currency: Currency;
  onChange: (c: Currency) => void;
};

export function CurrencyToggle({ currency, onChange }: Props) {
  return (
    <div className="inline-grid grid-cols-2 gap-1 rounded-pill bg-grouped p-1 text-sm font-semibold">
      {(["USD", "LBP"] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`press rounded-pill px-4 py-1.5 transition ${
            currency === c ? "bg-white text-carrot shadow-segment" : "text-label-secondary"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
