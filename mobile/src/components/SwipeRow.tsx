import { memo, useCallback, useEffect, useMemo, useRef } from "react";
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
import {
  colors,
  motion,
  numeric,
  radius,
  shadows,
  text,
  weight,
  white,
  withAlpha,
} from "@/lib/theme";
import type { Transaction } from "@/types/db";

const ACTION_W = 76; // px revealed per side
const AUTO_RESET_MS = 2000; // close an open row if no action is taken
// Light, crisp snap — quick tween, no springy overshoot.
const SNAP = { duration: motion.snap, easing: Easing.bezier(...motion.snapEase) };

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
//
// Layout, in three layers (see PORTING.md §3): a shadow shell (the card's
// colour + `shadow-card`, never clipped), a clipping frame (`overflow hidden`,
// rounded-card) with the two action panels pinned to its edges, and the
// sliding content — a plain rectangle the frame clips, so it never leaves a
// gap against the panels. Memoized: it lives inside a virtualized list.
export const SwipeRow = memo(function SwipeRow({
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
        card: "#3A3A3C",
        label: colors.white,
        meta: white(0.55),
        iconAlpha: 0.2, // `${color}33`
      }
    : {
        card: colors.surface,
        label: colors.label,
        meta: colors.labelSecondary,
        iconAlpha: 0.1, // `${color}1A`
      };

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

  // The JS half of `snapTo`: when a row settles open, auto-close it after a
  // short delay if the user doesn't tap Edit/Delete. Closing rows cancel any
  // pending timer.
  const armResetTimer = useCallback(
    (target: number) => {
      clearResetTimer();
      if (target !== 0) {
        resetTimer.current = setTimeout(() => {
          resetTimer.current = null;
          x.value = withTiming(0, SNAP);
        }, AUTO_RESET_MS);
      }
    },
    [clearResetTimer, x],
  );

  // `snapTo` for the JS side (the action buttons).
  const snapTo = useCallback(
    (target: number) => {
      x.value = withTiming(target, SNAP);
      armResetTimer(target);
    },
    [armResetTimer, x],
  );

  // Clean up the pending timer if the row unmounts.
  useEffect(() => clearResetTimer, [clearResetTimer]);

  const gesture = useMemo(() => {
    // `snapTo` for the UI thread: the tween runs here, only the timer hops
    // over to JS.
    const snap = (target: number) => {
      "worklet";
      x.value = withTiming(target, SNAP);
      runOnJS(armResetTimer)(target);
    };
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-10, 10])
      .onBegin(() => {
        startX.value = x.value;
      })
      .onStart(() => {
        runOnJS(clearResetTimer)();
      })
      .onUpdate((e) => {
        const next = startX.value + e.translationX;
        // dragConstraints ±ACTION_W with a little give past them (dragElastic 0.06).
        const clamped = Math.max(-ACTION_W, Math.min(ACTION_W, next));
        x.value = clamped + (next - clamped) * 0.06;
      })
      .onEnd((e) => {
        // Use velocity to commit/dismiss the swipe more naturally.
        const projected = x.value + e.velocityX * 0.08;
        if (projected <= -ACTION_W / 2) snap(-ACTION_W);
        else if (projected >= ACTION_W / 2) snap(ACTION_W);
        else snap(0);
      })
      .onFinalize((_e, success) => {
        // A drag cancelled mid-way (the list took the touch) must not leave
        // the row hanging between positions.
        if (success) return;
        const v = x.value;
        if (v === 0 || v === ACTION_W || v === -ACTION_W) return;
        snap(v <= -ACTION_W / 2 ? -ACTION_W : v >= ACTION_W / 2 ? ACTION_W : 0);
      });
    // A tap on an open row closes it; a tap on a closed row does nothing (the
    // content isn't a button on the web either).
    const tap = Gesture.Tap().onEnd(() => {
      if (x.value !== 0) snap(0);
    });
    return Gesture.Race(pan, tap);
  }, [armResetTimer, clearResetTimer, startX, x]);

  const sliding = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View style={[styles.shell, { backgroundColor: tone.card }]}>
      <View style={styles.frame}>
        {/* Edit revealed by swiping right. */}
        <Press
          noScale
          accessibilityLabel="Edit"
          onPress={() => {
            snapTo(0);
            onEdit(tx);
          }}
          style={[styles.action, styles.actionLeft]}
        >
          <Pencil size={20} strokeWidth={2} color={colors.white} />
        </Press>
        {/* Delete revealed by swiping left. */}
        <Press
          noScale
          accessibilityLabel="Delete"
          onPress={() => {
            snapTo(0);
            onDelete(tx);
          }}
          style={[styles.action, styles.actionRight]}
        >
          <Trash2 size={20} strokeWidth={2} color={colors.white} />
        </Press>

        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.content, { backgroundColor: tone.card }, sliding]}>
            <View style={[styles.badge, { backgroundColor: withAlpha(color, tone.iconAlpha) }]}>
              <Icon size={20} strokeWidth={2} color={color} />
            </View>
            <View style={styles.body}>
              <Text style={[styles.label, { color: tone.label }]}>
                {categoryLabel(tx.category)}
              </Text>
              {tx.note ? (
                <Text numberOfLines={1} style={[styles.meta, { color: tone.meta }]}>
                  {tx.note}
                </Text>
              ) : null}
              <Text style={[styles.meta, { color: tone.meta }]}>
                {dateLabel(tx.occurred_at)}
                {tx.original_currency === "LBP" && " · LBP"}
              </Text>
            </View>
            <Text style={[styles.amount, { color: amountColor(tx.is_income) }]}>
              {tx.is_income ? "+" : "-"}
              {tx.amountMask != null ? `$${tx.amountMask}` : formatUsdCents(tx.amount_usd_cents)}
            </Text>
          </Animated.View>
        </GestureDetector>

        {/* `ring-1 ring-inset ring-white/5`: drawn on the frame, above the
            content (an inset shadow on the frame itself would be painted
            under the opaque content), so it follows the rounded corners. */}
        {dark && <View pointerEvents="none" style={styles.ring} />}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // shadow-card — on the shell, outside the clipping frame.
  shell: { borderRadius: radius.card, boxShadow: shadows.card },
  // relative overflow-hidden rounded-card
  frame: { position: "relative", overflow: "hidden", borderRadius: radius.card },
  // absolute inset-y-0 flex items-center justify-center, `width: ACTION_W`
  action: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: ACTION_W,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLeft: { left: 0, backgroundColor: colors.carrot },
  actionRight: { right: 0, backgroundColor: colors.expense },
  // relative flex items-center gap-3 px-4 py-3.5 — a rectangle, no radius.
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  // h-10 w-10 rounded-pill
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  label: { ...text.base, fontWeight: weight.medium },
  meta: { ...text.xs },
  amount: { ...numeric, ...text.base, fontWeight: weight.medium },
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.card,
    boxShadow: shadows.ringWhite5,
  },
});
