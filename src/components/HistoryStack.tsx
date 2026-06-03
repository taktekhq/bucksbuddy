import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { amountColorClass, formatSignedUsdCents } from "@/lib/money";
import { SwipeRow } from "@/components/SwipeRow";
import type { HistoryGroup } from "@/lib/history";
import type { Transaction } from "@/types/db";

// One category's worth of history. A single entry is just a plain row. Two or
// more render as a stacked card (with layers peeking behind) that expands open
// on tap to reveal every entry — and stays open (no collapse, by design).
export function HistoryStack({
  group,
  onEdit,
  onDelete,
}: {
  group: HistoryGroup;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const [open, setOpen] = useState(false);

  if (group.count === 1) {
    return <SwipeRow tx={group.rows[0]} onEdit={onEdit} onDelete={onDelete} />;
  }

  const Icon = categoryIcon(group.category);
  const color = categoryColor(group.category);
  const label = categoryLabel(group.category);
  const total = group.masked
    ? `${group.isIncome ? "+" : "-"}••••`
    : formatSignedUsdCents(group.totalCents);

  if (open) {
    return (
      <AnimatePresence initial={false}>
        <motion.ul
          className="flex flex-col gap-1.5 overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          transition={{ type: "tween", duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {group.rows.map((tx) => (
            <li key={tx.id}>
              <SwipeRow tx={tx} onEdit={onEdit} onDelete={onDelete} />
            </li>
          ))}
        </motion.ul>
      </AnimatePresence>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={false}
      aria-label={`${label}, ${group.count} entries`}
      onClick={() => setOpen(true)}
      className="press relative block w-full text-left"
    >
      {/* Layers peeking out below the front card to read as a stack. */}
      <span
        aria-hidden
        className="absolute inset-0 translate-y-2 scale-x-[0.92] rounded-card bg-surface shadow-card"
      />
      <span
        aria-hidden
        className="absolute inset-0 translate-y-1 scale-x-[0.96] rounded-card bg-surface shadow-card"
      />
      {/* Front card. */}
      <span className="relative flex items-center gap-3 rounded-card bg-surface px-4 py-3.5 shadow-card">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill"
          style={{ backgroundColor: `${color}1A`, color }}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-label">{label}</span>
          <span className="block text-xs text-label-secondary">
            {group.count} entries
          </span>
        </span>
        <span className={`font-numeric font-medium tabular-nums ${amountColorClass(group.isIncome)}`}>
          {total}
        </span>
      </span>
    </button>
  );
}
