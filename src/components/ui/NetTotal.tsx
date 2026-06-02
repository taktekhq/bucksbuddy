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
  // Left-aligned, Apple-style stat: a plain SF month caption, the hero number in
  // the heaviest weight, and a small Grobold (grey) Bugs-ism underneath.
  const size = compact ? "text-4xl" : "text-5xl";
  return (
    <div>
      <p className="text-sm font-medium text-label-secondary">{monthLabel}</p>
      <p
        className={`mt-1 font-numeric ${size} font-black tabular-nums ${netColorClass(
          cents,
        )}`}
      >
        {formatSignedUsdCents(cents)}
      </p>
      <p className="mt-1 font-display text-xs uppercase tracking-wide text-label-secondary">
        {quip(cents)}
      </p>
    </div>
  );
}
