import type { Currency } from "@/lib/currency";
import { formatMasked, formatSignedCents, netColorClass } from "@/lib/money";

// Clean Apple stat: a small caption on top, the net number below it,
// green/red by direction. Left-aligned. When `masked` (the device is locked),
// the number is obscured. `currency` is the home currency the cents are in.
export function NetTotal({
  cents,
  label,
  currency,
  masked = false,
}: {
  cents: number;
  label: string;
  currency: Currency;
  masked?: boolean;
}) {
  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-wide text-label-secondary">
        {label}
      </p>
      <p
        className={`mt-1 font-numeric text-4xl font-bold tabular-nums ${
          masked ? "text-label-muted" : netColorClass(cents)
        }`}
      >
        {masked ? formatMasked("•••••", currency) : formatSignedCents(cents, currency)}
      </p>
    </div>
  );
}
