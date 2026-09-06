import { memo, useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Press } from "@/components/ui/Press";
import { SwipeRow } from "@/components/SwipeRow";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { formatSignedUsdCents, amountColorClass } from "@/lib/money";
import { motion } from "@/lib/theme";
import type { HistoryGroup } from "@/lib/history";
import type { Transaction } from "@/types/db";

// The web's `height: 0 → auto` tween over 0.22s cubic-bezier(0.2, 0.8, 0.2, 1):
// the opened list grows through a layout transition while the revealed rows
// fade in, which is the same read as the browser's height animation.
const EXPAND = LinearTransition.duration(motion.pop);
const REVEAL = FadeIn.duration(motion.pop);


// One category's worth of history on the dark full-history page. A single entry
// is just a plain row. Two or more render as a stacked card (with charcoal
// layers peeking out below) that expands open on tap to reveal every entry —
// and stays open (no collapse, by design). The layers are reserved their own
// room below the front card (the `pb`), so the stack reads clearly without
// crowding the next item in the list.
//
// `open`/`onOpen`/`stackKey` are optional: the full-history page virtualizes
// the list, so a cell scrolled far away is unmounted and the page has to keep
// the open set — otherwise a stack you opened would fold back up behind your
// back. Without them the stack owns the state, exactly as on the web.
//
// `flex-row` is the one class added to the web's strings: the web's `flex` is a
// row by default, React Native's is a column.
export const HistoryStack = memo(function HistoryStack({
  group,
  onEdit,
  onDelete,
  open,
  onOpen,
  stackKey,
}: {
  group: HistoryGroup;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  open?: boolean;
  onOpen?: (key: string) => void;
  stackKey?: string;
}) {
  const [openLocal, setOpenLocal] = useState(false);
  const isOpen = open ?? openLocal;
  // A recycled cell that remounts already open shouldn't replay the reveal.
  const mountedOpen = useRef(isOpen);
  const key = stackKey ?? group.key;
  const handleOpen = useCallback(() => {
    setOpenLocal(true);
    onOpen?.(key);
  }, [key, onOpen]);

  if (group.count === 1) {
    return <SwipeRow tx={group.rows[0]} onEdit={onEdit} onDelete={onDelete} dark />;
  }

  const Icon = categoryIcon(group.category);
  const color = categoryColor(group.category);
  const label = categoryLabel(group.category);
  const total = group.masked
    ? `${group.isIncome ? "+" : "-"}••••`
    : formatSignedUsdCents(group.totalCents);

  if (isOpen) {
    return (
      <Animated.View layout={EXPAND} className="flex flex-col gap-1.5 overflow-hidden">
        {group.rows.map((tx) => (
          <Animated.View key={tx.id} entering={mountedOpen.current ? undefined : REVEAL}>
            <SwipeRow tx={tx} onEdit={onEdit} onDelete={onDelete} dark />
          </Animated.View>
        ))}
      </Animated.View>
    );
  }

  return (
    <Press
      accessibilityRole="button"
      aria-expanded={false}
      accessibilityLabel={`${label}, ${group.count} entries`}
      onPress={handleOpen}
      className="relative block w-full pb-3 text-left"
    >
      {/* Two charcoal layers peeking out below the front card to read as a
          stack. Each is a touch darker and narrower than the one in front; the
          button's pb-3 reserves the 12px they drop into so they never crowd the
          next list item. */}
      <View
        aria-hidden
        className="absolute inset-x-0 bottom-3 top-0 translate-y-3 scale-x-[0.90] rounded-card bg-[#2E2E30] border border-white/5"
      />
      <View
        aria-hidden
        className="absolute inset-x-0 bottom-3 top-0 translate-y-1.5 scale-x-[0.95] rounded-card bg-[#343436] border border-white/5"
      />
      {/* Front card. */}
      <View className="relative flex flex-row items-center gap-3 rounded-card bg-[#3A3A3C] px-4 py-3.5 border border-white/5">
        <View
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill"
          style={{ backgroundColor: `${color}33` }}
        >
          <Icon size={20} strokeWidth={2} color={color} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="block font-medium text-white">{label}</Text>
          <Text className="block text-xs text-white/55">{group.count} entries</Text>
        </View>
        <Text
          className={`font-numeric font-medium tabular-nums ${amountColorClass(group.isIncome)}`}
        >
          {total}
        </Text>
      </View>
    </Press>
  );
});
