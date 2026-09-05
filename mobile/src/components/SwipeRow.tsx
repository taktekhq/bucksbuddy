import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
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
import { formatUsdCents, amountColorClass } from "@/lib/money";
import { colors, motion } from "@/lib/theme";
import type { Transaction } from "@/types/db";

const ACTION_W = 76; // px revealed per side
const AUTO_RESET_MS = 2000; // close an open row if no action is taken
// Light, crisp snap — quick tween, no springy overshoot. (The web's
// `{ type: "tween", duration: 0.16, ease: [0.2, 0, 0, 1] }`.)
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
// Two class names are added to the web's strings, both because a browser
// default isn't React Native's: `flex-row` wherever the web's `flex` laid out
// a row (RN's default direction is column), and `shadow-card` moves one level
// out (see the wrapper's comment). Everything else is the web's, verbatim.
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
  // `shell` isn't on the web: it's the card colour again on the shadow wrapper,
  // so iOS has an opaque body to cast `shadow-card` from.
  const tone = dark
    ? {
        card: "bg-[#3A3A3C] border border-white/5",
        shell: "bg-[#3A3A3C]",
        label: "text-white",
        meta: "text-white/55",
        iconAlpha: "33",
      }
    : {
        card: "bg-surface",
        shell: "bg-surface",
        label: "text-label",
        meta: "text-label-secondary",
        iconAlpha: "1A",
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

  // `snapTo` for the JS side (the two action buttons).
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
    // `snapTo` for the UI thread: the tween runs in the worklet, only the
    // timer hops over to JS.
    const snap = (target: number) => {
      "worklet";
      x.value = withTiming(target, SNAP);
      runOnJS(armResetTimer)(target);
    };
    // The offsets are what let the row live inside a scrolling list: the pan
    // only takes over once the finger has committed to horizontal movement,
    // and gives up the moment it drifts vertically.
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
        // dragConstraints ±ACTION_W, with a little give past them (dragElastic
        // 0.06) and no momentum.
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
    // The web's `onClick` on the sliding content: a tap on an open row closes
    // it, a tap on a closed row does nothing.
    const tap = Gesture.Tap().onEnd(() => {
      if (x.value !== 0) snap(0);
    });
    return Gesture.Race(pan, tap);
  }, [armResetTimer, clearResetTimer, startX, x]);

  const sliding = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    // The web writes `relative overflow-hidden rounded-card shadow-card` on one
    // element. On iOS a clipping view masks its own shadow away, so `shadow-card`
    // moves out here — same rounding, and the card colour so the shadow has a
    // body to fall from. The frame below is otherwise the web's element.
    <View className={`rounded-card shadow-card ${tone.shell}`}>
      <View className="relative overflow-hidden rounded-card">
        {/* Edit revealed by swiping right. */}
        <Press
          noScale
          accessibilityLabel="Edit"
          onPress={() => {
            snapTo(0);
            onEdit(tx);
          }}
          className="absolute inset-y-0 left-0 flex items-center justify-center bg-carrot text-white"
          style={{ width: ACTION_W }}
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
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-expense text-white"
          style={{ width: ACTION_W }}
        >
          <Trash2 size={20} strokeWidth={2} color={colors.white} />
        </Press>

        {/* The sliding content is the last child and opaque, so the frame's
            clipping keeps the two actions hidden until it moves off them. */}
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={sliding}
            className={`relative flex flex-row items-center gap-3 px-4 py-3.5 ${tone.card}`}
          >
            <View
              className="flex h-10 w-10 items-center justify-center rounded-pill"
              style={{ backgroundColor: `${color}${tone.iconAlpha}` }}
            >
              <Icon size={20} strokeWidth={2} color={color} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className={`font-medium ${tone.label}`}>{categoryLabel(tx.category)}</Text>
              {tx.note ? (
                <Text numberOfLines={1} className={`truncate text-xs ${tone.meta}`}>
                  {tx.note}
                </Text>
              ) : null}
              <Text className={`text-xs ${tone.meta}`}>
                {dateLabel(tx.occurred_at)}
                {tx.original_currency === "LBP" && " · LBP"}
              </Text>
            </View>
            <Text
              className={`font-numeric font-medium tabular-nums ${amountColorClass(tx.is_income)}`}
            >
              {tx.is_income ? "+" : "-"}
              {tx.amountMask != null
                ? `$${tx.amountMask}`
                : formatUsdCents(tx.amount_usd_cents)}
            </Text>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
});
