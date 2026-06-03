import { formatSignedUsdCents, netColorClass } from "@/lib/money";

// Clean Apple stat: a small month caption on top, the net number below it,
// green/red by direction. Left-aligned. When `masked` (the device is locked),
// the number is obscured.
export function NetTotal({
  cents,
  monthLabel,
  masked = false,
}: {
  cents: number;
  monthLabel: string;
  masked?: boolean;
}) {
  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-wide text-label-secondary">
        {monthLabel}
      </p>
      <p
        className={`mt-1 font-numeric text-4xl font-bold tabular-nums ${
          masked ? "text-label-muted" : netColorClass(cents)
        }`}
      >
        {masked ? "$•••••" : formatSignedUsdCents(cents)}
      </p>
    </div>
  );
}
