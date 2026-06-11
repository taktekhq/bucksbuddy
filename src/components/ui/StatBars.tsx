import type { LucideIcon } from "lucide-react";

// Horizontal category bars for the Stats page. Purely presentational: callers
// map their numbers (cents or counts) to a formatted `value` and a `fraction`
// of the widest bar. Inherits text color, so it sits on the dark screen as-is.

export type StatBarItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  value: string; // right-aligned, already formatted ("$12.50" or "×4")
  fraction: number; // 0..1 of the widest bar
};

export function StatBars({ items }: { items: StatBarItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ id, label, icon: Icon, color, value, fraction }) => (
        <li key={id} className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            // Hex + "26" alpha ≈ 15% tint of the category color.
            style={{ backgroundColor: `${color}26`, color }}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{label}</span>
              <span className="font-numeric text-sm font-bold tabular-nums">
                {value}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-white/10">
              <div
                className="h-full rounded-pill"
                // Even the smallest category gets a visible sliver.
                style={{
                  width: `${Math.max(fraction * 100, 2)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
