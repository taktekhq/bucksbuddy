import { formatSignedUsdCents, netColorClass } from "@/lib/money";

type Props = {
  cents: number;
  monthLabel: string;
  compact?: boolean;
};

export function NetTotal({ cents, monthLabel, compact = false }: Props) {
  if (compact) {
    return (
      <div>
        <p className="text-xs font-medium text-label-secondary">{monthLabel}</p>
        <p
          className={`text-4xl font-semibold tracking-tight tabular-nums ${netColorClass(
            cents,
          )}`}
        >
          {formatSignedUsdCents(cents)}
        </p>
        <p className="text-xs text-label-secondary">net this month</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-sm font-medium text-label-secondary">
        {monthLabel} · What&apos;s up, Doc?
      </p>
      <p
        className={`mt-2 text-6xl font-semibold tracking-tight tabular-nums ${netColorClass(
          cents,
        )}`}
      >
        {formatSignedUsdCents(cents)}
      </p>
      <p className="mt-1 text-sm text-label-secondary">net this month</p>
    </div>
  );
}
