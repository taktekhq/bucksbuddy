import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SwipeRow } from "@/components/SwipeRow";
import { resolveCategoryIcon } from "@/lib/categoryIcons";
import { categoryColor, categoryIconName, categoryLabel } from "@bucksbuddy/core/categories";
import { amountColorClass, formatSignedUsdCents } from "@bucksbuddy/core/money";
import type { HistoryGroup } from "@bucksbuddy/core/history";
import type { Transaction } from "@bucksbuddy/core/types";

// One category's worth of history on the dark full-history page. A single entry
// is just a plain row. Two or more render as a stacked card (with charcoal
// layers peeking out below) that expands open on tap to reveal every entry —
// and stays open (no collapse, by design). Mirrors
// src/components/HistoryStack.tsx, minus the expand-open height animation
// (framer-motion's AnimatePresence height transition) — this just swaps the
// content instantly. A Reanimated layout-transition version is follow-up
// work, not a History-screen blocker.
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

  const Icon = resolveCategoryIcon(categoryIconName(group.category));
  const color = categoryColor(group.category);
  const label = categoryLabel(group.category);
  const total = group.masked ? `${group.isIncome ? "+" : "-"}••••` : formatSignedUsdCents(group.totalCents);

  if (open) {
    return (
      <View className="gap-1.5">
        {group.rows.map((tx) => (
          <SwipeRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} dark />
        ))}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: false }}
      accessibilityLabel={`${label}, ${group.count} entries`}
      onPress={() => setOpen(true)}
      className="relative w-full pb-3"
    >
      {/* Two charcoal layers peeking out below the front card to read as a
          stack. Each is a touch darker and narrower than the one in front; the
          pb-3 reserves the 12px they drop into so they never crowd the next
          list item. */}
      <View
        pointerEvents="none"
        style={{ transform: [{ translateY: 12 }, { scaleX: 0.9 }] }}
        className="absolute inset-x-0 bottom-3 top-0 rounded-card bg-[#2E2E30]"
      />
      <View
        pointerEvents="none"
        style={{ transform: [{ translateY: 6 }, { scaleX: 0.95 }] }}
        className="absolute inset-x-0 bottom-3 top-0 rounded-card bg-[#343436]"
      />
      {/* Front card. */}
      <View className="relative flex-row items-center gap-3 rounded-card bg-[#3A3A3C] px-4 py-3.5">
        <View style={{ backgroundColor: `${color}33` }} className="h-10 w-10 items-center justify-center rounded-pill">
          <Icon size={20} strokeWidth={2} color={color} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-medium text-white">{label}</Text>
          <Text className="text-xs text-white/55">{group.count} entries</Text>
        </View>
        <Text className={`font-numeric font-medium tabular-nums ${amountColorClass(group.isIncome)}`}>{total}</Text>
      </View>
    </Pressable>
  );
}
