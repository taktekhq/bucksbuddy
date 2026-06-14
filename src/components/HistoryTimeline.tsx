import { HistoryStack } from "@/components/HistoryStack";
import { formatSignedUsdCents, netColorClass } from "@/lib/money";
import type { TimelineDay } from "@/lib/history";
import type { Transaction } from "@/types/db";

// The chronological history view: one section per day, each headed by the day's
// label and net total, with entries underneath in reverse-chronological order.
// Back-to-back entries of the same category collapse into a HistoryStack; a lone
// entry is just a row. This is the "did I log everything yesterday?" view.
export function HistoryTimeline({
  days,
  onEdit,
  onDelete,
}: {
  days: TimelineDay[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => (
        <section key={day.key} className="flex flex-col gap-1.5">
          <header className="flex items-baseline justify-between px-1">
            <h2 className="font-display text-xs font-bold uppercase tracking-wide text-white/55">
              {day.label}
            </h2>
            <span
              className={`font-numeric text-sm font-medium tabular-nums ${
                day.totalCents === 0 ? "text-white/55" : netColorClass(day.totalCents)
              }`}
            >
              {day.masked ? "••••" : formatSignedUsdCents(day.totalCents)}
            </span>
          </header>
          <ul className="flex flex-col gap-1.5">
            {day.groups.map((g, i) => (
              <li key={`${day.key}:${i}`}>
                <HistoryStack group={g} onEdit={onEdit} onDelete={onDelete} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
