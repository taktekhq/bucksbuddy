import { useRef, useState } from "react";
import { categoryEmoji, categoryLabel } from "@/lib/categories";
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
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startDx = useRef(0);
  const moved = useRef(false);

  function clamp(v: number) {
    return Math.max(-ACTION_W, Math.min(ACTION_W, v));
  }

  function onStart(e: React.TouchEvent) {
    setDragging(true);
    moved.current = false;
    startX.current = e.touches[0].clientX;
    startDx.current = dx;
  }
  function onMove(e: React.TouchEvent) {
    if (!dragging) return;
    const delta = e.touches[0].clientX - startX.current;
    if (Math.abs(delta) > 6) moved.current = true;
    setDx(clamp(startDx.current + delta));
  }
  function onEnd() {
    setDragging(false);
    if (dx <= -ACTION_W / 2) setDx(-ACTION_W);
    else if (dx >= ACTION_W / 2) setDx(ACTION_W);
    else setDx(0);
  }
  function onContentClick() {
    // Ignore the click synthesized right after a swipe; only a real tap closes.
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (dx !== 0) setDx(0);
  }

  return (
    <div className="relative overflow-hidden">
      {/* Edit revealed by swiping right. */}
      <button
        type="button"
        onClick={() => {
          setDx(0);
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
          setDx(0);
          onDelete(tx);
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-expense font-medium text-white"
        style={{ width: ACTION_W }}
      >
        Delete
      </button>

      <div
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onClick={onContentClick}
        className="relative flex items-center gap-3 bg-grouped px-4 py-3"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
      >
        <span className="text-2xl">{categoryEmoji(tx.category)}</span>
        <div className="flex-1">
          <p className="font-medium">{categoryLabel(tx.category)}</p>
          <p className="text-xs text-label-secondary">
            {dateLabel(tx.occurred_at)}
            {tx.original_currency === "LBP" && " · LBP"}
          </p>
        </div>
        <span
          className={`font-semibold tabular-nums ${
            tx.is_income ? "text-income" : "text-expense"
          }`}
        >
          {tx.is_income ? "+" : "-"}
          {formatUsdCents(tx.amount_usd_cents)}
        </span>
      </div>
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
    <ul className="divide-y divide-separator overflow-hidden rounded-card">
      {rows.map((tx) => (
        <li key={tx.id}>
          <SwipeRow tx={tx} onEdit={onEdit} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
