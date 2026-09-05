import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Pencil, Trash2 } from "lucide-react-native";

import { resolveCategoryIcon } from "@/lib/categoryIcons";
import { categoryColor, categoryIconName, categoryLabel } from "@bucksbuddy/core/categories";
import { amountColorClass, formatUsdCents } from "@bucksbuddy/core/money";
import type { Transaction } from "@bucksbuddy/core/types";

const ACTION_W = 76; // px revealed per side
const AUTO_RESET_MS = 2000; // close an open row if no action is taken

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function clamp(v: number, min: number, max: number): number {
  "worklet";
  return Math.min(Math.max(v, min), max);
}

// A single history entry with swipe-to-reveal edit/delete actions. Shared by
// the flat HistoryList on Home (light) and the stacked HistoryStack on the
// full-history page (dark) — `dark` swaps the white card for a charcoal one
// that reads on the deep-grey "rabbit hole" page. Mirrors
// src/components/SwipeRow.tsx — same gesture shape (drag, velocity-projected
// commit/dismiss, auto-reset timer), built on react-native-gesture-handler +
// Reanimated instead of framer-motion.
export function SwipeRow({
  tx,
  onEdit,
  onDelete,
  dark = false,
}: {
  tx: Transaction;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  dark?: boolean;
}) {
  const x = useSharedValue(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = resolveCategoryIcon(categoryIconName(tx.category));
  const color = categoryColor(tx.category);

  const tone = dark
    ? {
        card: "bg-[#3A3A3C]",
        label: "text-white",
        meta: "text-white/55",
        iconAlpha: "33",
      }
    : {
        card: "bg-surface",
        label: "text-label",
        meta: "text-label-secondary",
        iconAlpha: "1A",
      };

  function clearResetTimer() {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }

  function snapTo(target: number) {
    // Light, crisp snap — quick tween, no springy overshoot.
    x.value = withTiming(target, { duration: 160 });
    // When a row settles open, auto-close it after a short delay if the
    // user doesn't tap Edit/Delete. Closing rows cancel any pending timer.
    clearResetTimer();
    if (target !== 0) {
      resetTimer.current = setTimeout(() => snapTo(0), AUTO_RESET_MS);
    }
  }

  // Clean up the pending timer if the row unmounts.
  useEffect(() => clearResetTimer, []);

  const pan = Gesture.Pan()
    .onStart(() => {
      runOnJS(clearResetTimer)();
    })
    .onChange((e) => {
      x.value = clamp(x.value + e.changeX, -ACTION_W, ACTION_W);
    })
    .onEnd((e) => {
      // Use velocity to commit/dismiss the swipe more naturally.
      const projected = x.value + e.velocityX * 0.08;
      const target = projected <= -ACTION_W / 2 ? -ACTION_W : projected >= ACTION_W / 2 ? ACTION_W : 0;
      runOnJS(snapTo)(target);
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(snapTo)(0);
  });

  const contentGesture = Gesture.Simultaneous(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View className="relative overflow-hidden rounded-card shadow-card">
      {/* Edit revealed by swiping right. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit"
        onPress={() => {
          snapTo(0);
          onEdit(tx);
        }}
        style={{ width: ACTION_W }}
        className="absolute inset-y-0 left-0 items-center justify-center bg-carrot"
      >
        <Pencil size={20} strokeWidth={2} color="#FFFFFF" />
      </Pressable>
      {/* Delete revealed by swiping left. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete"
        onPress={() => {
          snapTo(0);
          onDelete(tx);
        }}
        style={{ width: ACTION_W }}
        className="absolute inset-y-0 right-0 items-center justify-center bg-expense"
      >
        <Trash2 size={20} strokeWidth={2} color="#FFFFFF" />
      </Pressable>

      <GestureDetector gesture={contentGesture}>
        <Animated.View
          style={animatedStyle}
          className={`relative flex-row items-center gap-3 px-4 py-3.5 ${tone.card}`}
        >
          <View style={{ backgroundColor: `${color}${tone.iconAlpha}` }} className="h-10 w-10 items-center justify-center rounded-pill">
            <Icon size={20} strokeWidth={2} color={color} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className={`font-medium ${tone.label}`}>{categoryLabel(tx.category)}</Text>
            {tx.note && (
              <Text numberOfLines={1} className={`text-xs ${tone.meta}`}>
                {tx.note}
              </Text>
            )}
            <Text className={`text-xs ${tone.meta}`}>
              {dateLabel(tx.occurred_at)}
              {tx.original_currency === "LBP" && " · LBP"}
            </Text>
          </View>
          <Text className={`font-numeric font-medium tabular-nums ${amountColorClass(tx.is_income)}`}>
            {tx.is_income ? "+" : "-"}
            {tx.amountMask != null ? `$${tx.amountMask}` : formatUsdCents(tx.amount_usd_cents)}
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
