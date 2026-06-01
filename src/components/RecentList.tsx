import type { Transaction } from "@/types/db";
import { categoryEmoji, categoryLabel } from "@/lib/categories";
import { formatUsdCents } from "@/lib/money";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RecentList({ rows }: { rows: Transaction[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-label-secondary">
        Nothing yet. Tap + to record your first one.
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-card bg-grouped">
      {rows.map((r, i) => (
        <li
          key={r.id}
          className={`flex items-center gap-3 px-4 py-3 ${
            i > 0 ? "border-t border-separator" : ""
          }`}
        >
          <span className="text-2xl">{categoryEmoji(r.category)}</span>
          <div className="flex-1">
            <p className="font-medium">{categoryLabel(r.category)}</p>
            <p className="text-xs text-label-secondary">
              {timeLabel(r.occurred_at)}
              {r.original_currency === "LBP" && " · LBP"}
            </p>
          </div>
          <span
            className={`font-semibold tabular-nums ${
              r.is_income ? "text-income" : "text-expense"
            }`}
          >
            {r.is_income ? "+" : "-"}
            {formatUsdCents(r.amount_usd_cents)}
          </span>
        </li>
      ))}
    </ul>
  );
}
