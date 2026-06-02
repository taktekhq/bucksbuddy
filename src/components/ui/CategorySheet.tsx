import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { InOutToggle } from "@/components/ui/InOutToggle";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import {
  categoriesFor,
  categoryColor,
  categoryIcon,
  categoryLabel,
  composeCategory,
  splitCategory,
  subcategoriesFor,
} from "@/lib/categories";

type Props = {
  open: boolean;
  isIncome: boolean;
  selected: string | null;
  onChangeDirection: (isIncome: boolean) => void;
  // Receives the stored id: "parent" or "parent/sub".
  onSelect: (id: string) => void;
  onClose: () => void;
};

// Bottom sheet with two steps. Step 1: the colorful category grid + the In/Out
// toggle pinned at the bottom. Step 2 (only for categories that have them): the
// subcategory picker, reached by tapping a category with a dot. Drag down to
// dismiss.
export function CategorySheet({
  open,
  isIncome,
  selected,
  onChangeDirection,
  onSelect,
  onClose,
}: Props) {
  // Which parent's subcategories are currently shown (null = the grid step).
  const [expanded, setExpanded] = useState<string | null>(null);

  // Always reopen on the grid step.
  useEffect(() => {
    if (open) setExpanded(null);
  }, [open]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  }

  function pickCategory(baseId: string) {
    if (subcategoriesFor(baseId).length > 0) {
      setExpanded(baseId);
    } else {
      onSelect(baseId);
    }
  }

  const selectedBase = selected ? splitCategory(selected).base : null;

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

            {expanded ? (
              <SubcategoryStep
                baseId={expanded}
                selected={selected}
                onBack={() => setExpanded(null)}
                onSelect={onSelect}
              />
            ) : (
              <>
                {/* Categories on top (variable height). */}
                <CategoryGrid
                  categories={categoriesFor(isIncome)}
                  selected={selectedBase}
                  onSelect={pickCategory}
                />

                {/* In/Out pinned at the bottom. */}
                <div className="mt-4">
                  <InOutToggle isIncome={isIncome} onChange={onChangeDirection} />
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Step 2: a back header that doubles as "use the parent only", then the
// subcategory chips tinted with the parent's color.
function SubcategoryStep({
  baseId,
  selected,
  onBack,
  onSelect,
}: {
  baseId: string;
  selected: string | null;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const color = categoryColor(baseId);
  const Icon = categoryIcon(baseId);
  const label = categoryLabel(baseId);
  const subs = subcategoriesFor(baseId);
  const { base: selBase, sub: selSub } = selected
    ? splitCategory(selected)
    : { base: null, sub: null };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to categories"
          className="press -m-2 p-2 text-label-secondary"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="font-bold text-label">{label}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {/* "Just the parent" — no subcategory. */}
        <button
          type="button"
          onClick={() => onSelect(composeCategory(baseId, null))}
          className="press rounded-card px-3 py-3.5 text-sm font-medium"
          style={{
            backgroundColor:
              selBase === baseId && !selSub ? color : `${color}1A`,
            color: selBase === baseId && !selSub ? "#FFFFFF" : color,
          }}
        >
          Just {label}
        </button>
        {subs.map((s) => {
          const active = selBase === baseId && selSub === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(composeCategory(baseId, s.id))}
              className="press rounded-card px-3 py-3.5 text-sm font-medium"
              style={{
                backgroundColor: active ? color : `${color}1A`,
                color: active ? "#FFFFFF" : color,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
