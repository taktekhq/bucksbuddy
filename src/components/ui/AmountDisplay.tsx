import type { Currency } from "@/lib/currency";
import { parseAmountString, toUsdCents } from "@/lib/currency";
import { formatUsdCents } from "@/lib/money";

type Props = {
  display: string;
  currency: Currency;
  lbpPerUsd: number;
};

// Big live amount. Shows the USD equivalent underneath when entering LBP.
export function AmountDisplay({ display, currency, lbpPerUsd }: Props) {
  const symbol = currency === "USD" ? "$" : "";
  const suffix = currency === "LBP" ? " LBP" : "";
  const shown = display === "" ? "0" : display;

  const usdCents = toUsdCents(parseAmountString(display), currency, lbpPerUsd);

  return (
    <div className="text-center">
      <div className="text-5xl font-semibold tracking-tight tabular-nums">
        {symbol}
        {shown}
        {suffix && <span className="text-2xl text-label-secondary">{suffix}</span>}
      </div>
      {currency === "LBP" && (
        <div className="mt-1 text-sm text-label-secondary">
          ≈ {formatUsdCents(usdCents)}
        </div>
      )}
    </div>
  );
}
