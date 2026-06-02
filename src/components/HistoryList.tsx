import { useRef } from "react";
import {
  animate,
  motion,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import { categoryIcon, categoryLabel } from "@/lib/categories";
import { formatUsdCents } from "@/lib/money";
import type { Transaction } from "@/types/db";

const ACTION_W = 88; // px revealed per side

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

  function snapTo(target: number) {
    animate(x, target, {
      type: "spring",
      stiffness: 500,
      damping: 40,
      mass: 0.6,
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
    <div className="relative overflow-hidden rounded-card">
      {/* Edit revealed by swiping right. */}
      <button
        type="button"
        onClick={() => {
          snapTo(0);
          onEdit(tx);
        }}
        className="absolute inset-y-0 left-0 flex items-center justify-center bg-carrot font-medium text-white"
        style={{ width: ACTION_W }}
      >
        Edit
      </button>
      {/* Delete revealed by swiping left. */}
      <button
        type="button"
        onClick={() => {
          snapTo(0);
          onDelete(tx);
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-label font-medium text-white"
        style={{ width: ACTION_W }}
      >
        Delete
      </button>

      <motion.div
        drag="x"
        dragConstraints={{ left: -ACTION_W, right: ACTION_W }}
        dragElastic={0.18}
        dragMomentum={false}
        onDrag={(_, info) => {
          if (Math.abs(info.offset.x) > 6) moved.current = true;
        }}
        onDragEnd={onDragEnd}
        onClick={onContentClick}
        style={{ x }}
        className="relative flex items-center gap-3 bg-surface px-4 py-3.5"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-grouped text-label">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="flex-1">
          <p className="font-medium">{categoryLabel(tx.category)}</p>
          <p className="text-xs text-label-secondary">
            {dateLabel(tx.occurred_at)}
            {tx.original_currency === "LBP" && " · LBP"}
          </p>
        </div>
        <span className="font-semibold tabular-nums text-label">
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
        Nothing yet. Add your first one above.
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
