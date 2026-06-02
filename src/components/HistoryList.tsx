import { useRef } from "react";
import {
  animate,
  motion,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { amountColorClass, formatUsdCents } from "@/lib/money";
import type { Transaction } from "@/types/db";

const ACTION_W = 76; // px revealed per side

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function SwipeRow({
  tx,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const x = useMotionValue(0);
  const moved = useRef(false);
  const Icon = categoryIcon(tx.category);
  const color = categoryColor(tx.category);

  function snapTo(target: number) {
    // Light, crisp snap — quick tween, no springy overshoot.
    animate(x, target, {
      type: "tween",
      duration: 0.16,
      ease: [0.2, 0, 0, 1],
    });
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const current = x.get();
    const velocity = info.velocity.x;
    // Use velocity to commit/dismiss the swipe more naturally.
    const projected = current + velocity * 0.08;
    if (projected <= -ACTION_W / 2) snapTo(-ACTION_W);
    else if (projected >= ACTION_W / 2) snapTo(ACTION_W);
    else snapTo(0);
  }

  function onContentClick() {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (x.get() !== 0) snapTo(0);
  }

  return (
    <div className="relative overflow-hidden rounded-card shadow-card">
      {/* Edit revealed by swiping right. */}
      <button
        type="button"
        aria-label="Edit"
        onClick={() => {
          snapTo(0);
          onEdit(tx);
        }}
        className="absolute inset-y-0 left-0 flex items-center justify-center bg-carrot text-white"
        style={{ width: ACTION_W }}
      >
        <Pencil className="h-5 w-5" strokeWidth={2} />
      </button>
      {/* Delete revealed by swiping left. */}
      <button
        type="button"
        aria-label="Delete"
        onClick={() => {
          snapTo(0);
          onDelete(tx);
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-expense text-white"
        style={{ width: ACTION_W }}
      >
        <Trash2 className="h-5 w-5" strokeWidth={2} />
      </button>

      <motion.div
        drag="x"
        dragConstraints={{ left: -ACTION_W, right: ACTION_W }}
        dragElastic={0.06}
        dragMomentum={false}
        onDrag={(_, info) => {
          if (Math.abs(info.offset.x) > 6) moved.current = true;
        }}
        onDragEnd={onDragEnd}
        onClick={onContentClick}
        style={{ x }}
        className="relative flex items-center gap-3 bg-surface px-4 py-3.5"
      >
        <span
          className="flex h-10 w-10 items-center justify-center rounded-pill"
          style={{ backgroundColor: `${color}1A`, color }}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="flex-1">
          <p className="font-medium text-label">{categoryLabel(tx.category)}</p>
          <p className="text-xs text-label-secondary">
            {dateLabel(tx.occurred_at)}
            {tx.original_currency === "LBP" && " · LBP"}
          </p>
        </div>
        <span className={`font-numeric font-semibold tabular-nums ${amountColorClass(tx.is_income)}`}>
          {tx.is_income ? "+" : "-"}
          {formatUsdCents(tx.amount_usd_cents)}
        </span>
      </motion.div>
    </div>
  );
}

export function HistoryList({
  rows,
  onEdit,
  onDelete,
}: {
  rows: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-label-secondary">
        Nothin' here yet, Doc. Add your first one above.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((tx) => (
        <li key={tx.id}>
          <SwipeRow tx={tx} onEdit={onEdit} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
