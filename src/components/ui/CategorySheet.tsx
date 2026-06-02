import { AnimatePresence, motion } from "framer-motion";
import { InOutToggle } from "@/components/ui/InOutToggle";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import { categoriesFor } from "@/lib/categories";

type Props = {
  open: boolean;
  isIncome: boolean;
  selected: string | null;
  onChangeDirection: (isIncome: boolean) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
};

// iOS-style bottom sheet for picking direction + category. In/Out lives on top
// and filters the grid; tapping a category selects it and dismisses.
export function CategorySheet({
  open,
  isIncome,
  selected,
  onChangeDirection,
  onSelect,
  onClose,
}: Props) {
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
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-[28px] bg-surface px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-3 shadow-card"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-grouped" />
            <div className="mb-3">
              <InOutToggle isIncome={isIncome} onChange={onChangeDirection} />
            </div>
            <CategoryGrid
              categories={categoriesFor(isIncome)}
              selected={selected}
              onSelect={onSelect}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
