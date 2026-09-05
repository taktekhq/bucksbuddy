import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Pencil, Trash2 } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { amountColor, formatUsdCents } from "@/lib/money";
import { colors, numeric, radius, shadowCard, white, withAlpha } from "@/lib/theme";
import type { Transaction } from "@/types/db";

const ACTION_W = 76; // px revealed per side
const AUTO_RESET_MS = 2000; // close an open row if no action is taken
// Light, crisp snap — quick tween, no springy overshoot.
const SNAP = { duration: 160, easing: Easing.bezier(0.2, 0, 0, 1) };

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// A single history entry with swipe-to-reveal edit/delete actions. Shared by
// the flat HistoryList on Home (light) and the stacked HistoryStack on the
// full-history page (dark) — `dark` swaps the white card for a charcoal one
// that reads on the deep-grey "rabbit hole" page.
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
  const startX = useSharedValue(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = categoryIcon(tx.category);
  const color = categoryColor(tx.category);

  // Light (white card on the grey canvas) vs dark (charcoal card on the
  // full-history page). On dark the category tint needs a touch more alpha to
  // read over charcoal, and a faint inset ring gives the card an edge.
  const tone = dark
    ? {
        card: styles.cardDark,
        label: "#FFFFFF",
        meta: white(0.55),
        iconAlpha: 0.2,
      }
    : {
        card: styles.cardLight,
        label: colors.label,
        meta: colors.labelSecondary,
        iconAlpha: 0.1,
      };

  function clearResetTimer() {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }

  function snapTo(target: number) {
    x.value = withTiming(target, SNAP);
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
    .activeOffsetX([-8, 8])
    .failOffsetY([-10, 10])
    .onStart(() => {
      startX.value = x.value;
      runOnJS(clearResetTimer)();
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      const clamped = Math.max(Math.min(next, ACTION_W), -ACTION_W);
      // A little give past the constraint (dragElastic 0.06).
      x.value = clamped + (next - clamped) * 0.06;
    })
    .onEnd((e) => {
      // Use velocity to commit/dismiss the swipe more naturally.
      const projected = x.value + e.velocityX * 0.08;
      const target =
        projected <= -ACTION_W / 2 ? -ACTION_W : projected >= ACTION_W / 2 ? ACTION_W : 0;
      runOnJS(snapTo)(target);
    });

  const tap = Gesture.Tap().onEnd(() => {
    if (x.value !== 0) runOnJS(snapTo)(0);
  });

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View style={[styles.outer, !dark && shadowCard]}>
      {/* Edit revealed by swiping right. */}
      <Press
        accessibilityLabel="Edit"
        onPress={() => {
          snapTo(0);
          onEdit(tx);
        }}
        style={[styles.action, styles.left, { backgroundColor: colors.carrot }]}
      >
        <Pencil size={20} strokeWidth={2} color="#FFF" />
      </Press>
      {/* Delete revealed by swiping left. */}
      <Press
        accessibilityLabel="Delete"
        onPress={() => {
          snapTo(0);
          onDelete(tx);
        }}
        style={[styles.action, styles.right, { backgroundColor: colors.expense }]}
      >
        <Trash2 size={20} strokeWidth={2} color="#FFF" />
      </Press>

      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <Animated.View style={[styles.content, tone.card, animated]}>
          <View style={[styles.badge, { backgroundColor: withAlpha(color, tone.iconAlpha) }]}>
            <Icon size={20} strokeWidth={2} color={color} />
          </View>
          <View style={styles.body}>
            <Text style={[styles.label, { color: tone.label }]}>
              {categoryLabel(tx.category)}
            </Text>
            {tx.note && (
              <Text style={[styles.meta, { color: tone.meta }]} numberOfLines={1}>
                {tx.note}
              </Text>
            )}
            <Text style={[styles.meta, { color: tone.meta }]}>
              {dateLabel(tx.occurred_at)}
              {tx.original_currency === "LBP" && " · LBP"}
            </Text>
          </View>
          <Text style={[styles.amount, { color: amountColor(tx.is_income) }]}>
            {tx.is_income ? "+" : "-"}
            {tx.amountMask != null
              ? `$${tx.amountMask}`
              : formatUsdCents(tx.amount_usd_cents)}
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { position: "relative", overflow: "hidden", borderRadius: radius.card },
  action: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: ACTION_W,
    alignItems: "center",
    justifyContent: "center",
  },
  left: { left: 0 },
  right: { right: 0 },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardLight: { backgroundColor: colors.surface },
  cardDark: {
    backgroundColor: "#3A3A3C",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: white(0.05),
    borderRadius: radius.card,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: 16, lineHeight: 24, fontWeight: "500" },
  meta: { fontSize: 12, lineHeight: 16 },
  amount: { ...numeric, fontSize: 16, lineHeight: 24, fontWeight: "500" },
});
