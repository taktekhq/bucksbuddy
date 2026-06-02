import { formatSignedUsdCents, netColorClass } from "@/lib/money";

// Clean Apple stat: a small month caption on top, the net number below it,
// green/red by direction. Left-aligned.
export function NetTotal({
  cents,
  monthLabel,
}: {
  cents: number;
  monthLabel: string;
}) {
  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-wide text-label-secondary">
        {monthLabel}
      </p>
      <p
        className={`mt-1 font-numeric text-4xl font-bold tabular-nums ${netColorClass(
          cents,
        )}`}
      >
        {formatSignedUsdCents(cents)}
      </p>
    </div>
  );
}
