import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { HistoryStack } from "@/components/HistoryStack";
import { groupByCategory } from "@/lib/history";
import type { Transaction } from "@/types/db";

// Full history in a bottom sheet (mirrors CategorySheet's look), with entries
// stacked by category. The list scrolls internally, so — unlike CategorySheet —
// the sheet is not draggable: dismissal is via the overlay tap or the close
// button, which avoids fighting the scroll gesture on a long list.
export function HistorySheet({
  open,
  rows,
  onEdit,
  onDelete,
  onClose,
}: {
  open: boolean;
  rows: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onClose: () => void;
}) {
  const groups = useMemo(() => groupByCategory(rows), [rows]);

  // Editing happens back on the page (the composer), so close first.
  function handleEdit(tx: Transaction) {
    onClose();
    onEdit(tx);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85vh] max-w-md flex-col rounded-t-[28px] bg-surface pt-2 shadow-card"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {/* Pinned header: grabber, title, close. */}
            <div className="shrink-0 px-4">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-grouped" />
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-label-secondary">
                  All history
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="press -m-2 p-2 text-label-secondary"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Scrollable body. */}
            <div className="flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+var(--safe-bottom))]">
              {groups.length === 0 ? (
                <p className="py-10 text-center text-label-secondary">
                  Nothin' here yet, Doc.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {groups.map((g) => (
                    <li key={g.key}>
                      <HistoryStack
                        group={g}
                        onEdit={handleEdit}
                        onDelete={onDelete}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
