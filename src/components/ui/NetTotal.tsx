import { formatSignedUsdCents, netColorClass } from "@/lib/money";

type Props = {
  cents: number;
  monthLabel: string;
  compact?: boolean;
};

// The month-net card body: the number in the heaviest weight (tight spacing),
// with the month directly underneath. The Bugs-ism lives outside, as the
// section title above the card.
export function NetTotal({ cents, monthLabel, compact = false }: Props) {
  const size = compact ? "text-4xl" : "text-5xl";
  return (
    <div>
      <p
        className={`font-numeric ${size} font-black leading-none tracking-tight tabular-nums ${netColorClass(
          cents,
        )}`}
      >
        {formatSignedUsdCents(cents)}
      </p>
      <p className="mt-2 text-sm font-medium text-label-secondary">{monthLabel}</p>
    </div>
  );
}
