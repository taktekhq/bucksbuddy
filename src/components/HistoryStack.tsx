import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { amountColorClass, formatSignedUsdCents } from "@/lib/money";
import { SwipeRow } from "@/components/SwipeRow";
import type { HistoryGroup } from "@/lib/history";
import type { Transaction } from "@/types/db";

// One category's worth of history on the dark full-history page. A single entry
// is just a plain row. Two or more render as a stacked card (with charcoal
// layers peeking out below) that expands open on tap to reveal every entry —
// and stays open (no collapse, by design). The layers are reserved their own
// room below the front card (the `pb`), so the stack reads clearly without
// crowding the next item in the list.
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
    return <SwipeRow tx={group.rows[0]} onEdit={onEdit} onDelete={onDelete} dark />;
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
              <SwipeRow tx={tx} onEdit={onEdit} onDelete={onDelete} dark />
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
      className="press relative block w-full pb-3 text-left"
    >
      {/* Two charcoal layers peeking out below the front card to read as a
          stack. Each is a touch darker and narrower than the one in front; the
          button's pb-3 reserves the 12px they drop into so they never crowd the
          next list item. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-3 top-0 translate-y-3 scale-x-[0.90] rounded-card bg-[#2E2E30] ring-1 ring-inset ring-white/5"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-3 top-0 translate-y-1.5 scale-x-[0.95] rounded-card bg-[#343436] ring-1 ring-inset ring-white/5"
      />
      {/* Front card. */}
      <span className="relative flex items-center gap-3 rounded-card bg-[#3A3A3C] px-4 py-3.5 ring-1 ring-inset ring-white/5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill"
          style={{ backgroundColor: `${color}33`, color }}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-white">{label}</span>
          <span className="block text-xs text-white/55">
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
