import { AnimatePresence, motion, type PanInfo } from "framer-motion";
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

// Bottom sheet: the colorful category grid on top (its height varies with the
// list), the In/Out toggle pinned at the bottom (it's the fixed anchor). Drag
// the sheet down to dismiss.
export function CategorySheet({
  open,
  isIncome,
  selected,
  onChangeDirection,
  onSelect,
  onClose,
}: Props) {
  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
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
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md touch-none rounded-t-[28px] bg-surface px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-2 shadow-card"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
          >
            {/* Grabber. */}
            <div className="mx-auto mb-4 h-1.5 w-10 cursor-grab rounded-full bg-grouped" />

            {/* Categories on top (variable height). */}
            <CategoryGrid
              categories={categoriesFor(isIncome)}
              selected={selected}
              onSelect={onSelect}
            />

            {/* In/Out pinned at the bottom. */}
            <div className="mt-4">
              <InOutToggle isIncome={isIncome} onChange={onChangeDirection} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
