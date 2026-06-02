import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import {
  SAFE_CATEGORY_ID,
  SAFE_SEED_CATEGORY_ID,
  categoryColor,
  categoryIcon,
  categoryLabel,
} from "@/lib/categories";
import { amountColorClass, formatUsdCents } from "@/lib/money";
import type { Transaction } from "@/types/db";

const ACTION_W = 76; // px revealed per side
const AUTO_RESET_MS = 2000; // close an open row if no action is taken

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function SwipeRow({
  tx,
  seeded = false,
  partner,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  // True when this Safe deposit is the visible half of an "existing savings"
  // pair: it reads as a "+" and deleting it removes its income partner too.
  seeded?: boolean;
  partner?: Transaction;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction, partner?: Transaction) => void;
}) {
  const x = useMotionValue(0);
  const moved = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = categoryIcon(tx.category);
  const color = categoryColor(tx.category);
  // Existing-savings rows count as money in: show a green "+" and a clear label.
  const showAsIncome = seeded || tx.is_income;
  const label = seeded ? "Existing savings" : categoryLabel(tx.category);

  function clearResetTimer() {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }

  function snapTo(target: number) {
    // Light, crisp snap — quick tween, no springy overshoot.
    animate(x, target, {
      type: "tween",
      duration: 0.16,
      ease: [0.2, 0, 0, 1],
    });
    // When a row settles open, auto-close it after a short delay if the
    // user doesn't tap Edit/Delete. Closing rows cancel any pending timer.
    clearResetTimer();
    if (target !== 0) {
      resetTimer.current = setTimeout(() => snapTo(0), AUTO_RESET_MS);
    }
  }

  // Clean up the pending timer if the row unmounts.
  useEffect(() => clearResetTimer, []);

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
      {/* Edit revealed by swiping right. Existing-savings rows are paired, so
          editing one half would desync them — delete-and-redo instead. */}
      {!seeded && (
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
      )}
      {/* Delete revealed by swiping left. */}
      <button
        type="button"
        aria-label="Delete"
        onClick={() => {
          snapTo(0);
          onDelete(tx, partner);
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-expense text-white"
        style={{ width: ACTION_W }}
      >
        <Trash2 className="h-5 w-5" strokeWidth={2} />
      </button>

      <motion.div
        drag="x"
        dragConstraints={{ left: -ACTION_W, right: seeded ? 0 : ACTION_W }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragStart={clearResetTimer}
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
        <div className="min-w-0 flex-1">
          <p className="font-medium text-label">{label}</p>
          {tx.note && (
            <p className="truncate text-xs text-label-secondary">{tx.note}</p>
          )}
          <p className="text-xs text-label-secondary">
            {dateLabel(tx.occurred_at)}
            {tx.original_currency === "LBP" && " · LBP"}
          </p>
        </div>
        <span className={`font-numeric font-medium tabular-nums ${amountColorClass(showAsIncome)}`}>
          {showAsIncome ? "+" : "-"}
          {formatUsdCents(tx.amount_usd_cents)}
        </span>
      </motion.div>
    </div>
  );
}

// An "existing savings" entry is two rows sharing an amount and timestamp: an
// income seed (category safe_seed) and the Safe deposit it cancels. Merge each
// pair so history shows one line — the deposit, rendered as a "+". The seed is
// hidden, and the two are linked so deleting the visible row removes both.
function pairExistingSavings(rows: Transaction[]) {
  const key = (t: Transaction) => `${t.amount_usd_cents}|${t.occurred_at}`;
  const depositsByKey = new Map<string, Transaction>();
  for (const t of rows) {
    if (t.category === SAFE_CATEGORY_ID && !t.is_income && !depositsByKey.has(key(t))) {
      depositsByKey.set(key(t), t);
    }
  }
  const hiddenSeedIds = new Set<string>();
  const seededDepositIds = new Set<string>();
  const partnerById = new Map<string, Transaction>();
  for (const t of rows) {
    if (t.category !== SAFE_SEED_CATEGORY_ID || !t.is_income) continue;
    const deposit = depositsByKey.get(key(t));
    if (deposit && !seededDepositIds.has(deposit.id)) {
      hiddenSeedIds.add(t.id);
      seededDepositIds.add(deposit.id);
      partnerById.set(deposit.id, t);
    }
  }
  return { hiddenSeedIds, seededDepositIds, partnerById };
}

export function HistoryList({
  rows,
  onEdit,
  onDelete,
}: {
  rows: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction, partner?: Transaction) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-label-secondary">
        Nothin' here yet, Doc. Add your first one above.
      </p>
    );
  }

  const { hiddenSeedIds, seededDepositIds, partnerById } =
    pairExistingSavings(rows);

  return (
    <ul className="flex flex-col gap-1.5">
      {rows
        .filter((tx) => !hiddenSeedIds.has(tx.id))
        .map((tx) => (
          <li key={tx.id}>
            <SwipeRow
              tx={tx}
              seeded={seededDepositIds.has(tx.id)}
              partner={partnerById.get(tx.id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </li>
        ))}
    </ul>
  );
}
