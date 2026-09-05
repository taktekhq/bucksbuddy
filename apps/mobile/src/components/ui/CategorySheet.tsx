import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";

import { InOutToggle } from "@/components/ui/InOutToggle";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import { resolveCategoryIcon } from "@/lib/categoryIcons";
import {
  categoriesFor,
  categoryColor,
  categoryIconName,
  categoryLabel,
  composeCategory,
  splitCategory,
  subcategoriesFor,
} from "@bucksbuddy/core/categories";

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
// subcategory picker, reached by tapping a category with a dot. Mirrors
// src/components/ui/CategorySheet.tsx — built on RN's Modal with a slide
// animation and tap-outside-to-dismiss rather than framer-motion's
// drag-to-dismiss gesture, which RN has no direct equivalent for; a real
// gesture-driven sheet is future work, not a Phase 2 blocker.
export function CategorySheet({ open, isIncome, selected, onChangeDirection, onSelect, onClose }: Props) {
  // Which parent's subcategories are currently shown (null = the grid step).
  const [expanded, setExpanded] = useState<string | null>(null);

  // Always reopen on the grid step.
  useEffect(() => {
    if (open) setExpanded(null);
  }, [open]);

  function pickCategory(baseId: string) {
    if (subcategoriesFor(baseId).length > 0) {
      setExpanded(baseId);
    } else {
      onSelect(baseId);
    }
  }

  const selectedBase = selected ? splitCategory(selected).base : null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose} />
      <SafeAreaView edges={["bottom"]} className="rounded-t-[28px] bg-surface px-4 pt-2">
        <View className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-grouped" />

        {expanded ? (
          <SubcategoryStep
            baseId={expanded}
            selected={selected}
            onBack={() => setExpanded(null)}
            onSelect={onSelect}
          />
        ) : (
          <>
            <CategoryGrid categories={categoriesFor(isIncome)} selected={selectedBase} onSelect={pickCategory} />
            <View className="mt-4 pb-6">
              <InOutToggle isIncome={isIncome} onChange={onChangeDirection} />
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
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
  const Icon = resolveCategoryIcon(categoryIconName(baseId));
  const label = categoryLabel(baseId);
  const subs = subcategoriesFor(baseId);
  const { base: selBase, sub: selSub } = selected ? splitCategory(selected) : { base: null, sub: null };

  return (
    <View className="pb-6">
      <View className="mb-3 flex-row items-center gap-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to categories" onPress={onBack} className="-m-2 p-2">
          <ChevronLeft size={20} strokeWidth={2.5} color="#8E8E93" />
        </Pressable>
        <View style={{ backgroundColor: color }} className="h-8 w-8 items-center justify-center rounded-full">
          <Icon size={16} strokeWidth={2} color="#FFFFFF" />
        </View>
        <Text className="font-bold text-label">{label}</Text>
      </View>

      <View className="flex-row flex-wrap gap-2.5">
        {/* "Just the parent" — no subcategory. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect(composeCategory(baseId, null))}
          style={{ backgroundColor: selBase === baseId && !selSub ? color : `${color}1A`, width: "47%" }}
          className="rounded-card px-3 py-3.5"
        >
          <Text style={{ color: selBase === baseId && !selSub ? "#FFFFFF" : color }} className="text-sm font-medium">
            Just {label}
          </Text>
        </Pressable>
        {subs.map((s) => {
          const active = selBase === baseId && selSub === s.id;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => onSelect(composeCategory(baseId, s.id))}
              style={{ backgroundColor: active ? color : `${color}1A`, width: "47%" }}
              className="rounded-card px-3 py-3.5"
            >
              <Text style={{ color: active ? "#FFFFFF" : color }} className="text-sm font-medium">
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
