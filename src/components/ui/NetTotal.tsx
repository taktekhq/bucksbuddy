import { formatSignedUsdCents, netColorClass } from "@/lib/money";

type Props = {
  cents: number;
  monthLabel: string;
  compact?: boolean;
};

// Cheeky status line that changes with how the month is going.
function quip(cents: number): string {
  if (cents > 0) return "Eh, lookin' rich, Doc.";
  if (cents < 0) return "Spendin' like a wabbit.";
  return "Dead even. Spooky.";
}

export function NetTotal({ cents, monthLabel, compact = false }: Props) {
  if (compact) {
    return (
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-wide text-label-secondary">
          {monthLabel}
        </p>
        <p
          className={`font-numeric text-4xl font-extrabold tabular-nums ${netColorClass(
            cents,
          )}`}
        >
          {formatSignedUsdCents(cents)}
        </p>
        <p className="text-xs text-label-secondary">net this month · {quip(cents)}</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-label-secondary">
        {monthLabel}
      </p>
      <p
        className={`mt-2 font-numeric text-5xl font-extrabold tabular-nums ${netColorClass(
          cents,
        )}`}
      >
        {formatSignedUsdCents(cents)}
      </p>
      <p className="mt-1 text-sm text-label-secondary">net this month · {quip(cents)}</p>
    </div>
  );
}
