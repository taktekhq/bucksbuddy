import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Trash2 } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { colors, motion, radius } from "@/lib/theme";

// Swipe a row left to reveal a Delete action — same mechanic as the main
// HistoryList, but delete-only (no edit). The content must be opaque so the
// action stays hidden until revealed. `style` is the web's `className` on the
// sliding content: keep it a plain rectangle (background, padding, ring) —
// the frame does the rounding and clipping.
const ACTION_W = 76; // px revealed
const AUTO_RESET_MS = 2000; // close an open row if no action is taken
const SNAP = { duration: motion.snap, easing: Easing.bezier(...motion.snapEase) };

export function SwipeToDelete({
  onDelete,
  style,
  deleteColor = "#FF3B30",
  children,
}: {
  onDelete: () => void;
  style?: StyleProp<ViewStyle>;
  deleteColor?: string;
  children: ReactNode;
}) {
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

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

  const snapTo = useCallback(
    (target: number) => {
      x.value = withTiming(target, SNAP);
      armResetTimer(target);
    },
    [armResetTimer, x],
  );

  useEffect(() => clearResetTimer, [clearResetTimer]);

  const gesture = useMemo(() => {
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
        // dragConstraints { left: -ACTION_W, right: 0 }, dragElastic 0.06.
        const clamped = Math.max(-ACTION_W, Math.min(0, next));
        x.value = clamped + (next - clamped) * 0.06;
      })
      .onEnd((e) => {
        const projected = x.value + e.velocityX * 0.08;
        if (projected <= -ACTION_W / 2) snap(-ACTION_W);
        else snap(0);
      })
      .onFinalize((_e, success) => {
        if (success) return;
        const v = x.value;
        if (v === 0 || v === -ACTION_W) return;
        snap(v <= -ACTION_W / 2 ? -ACTION_W : 0);
      });
    const tap = Gesture.Tap().onEnd(() => {
      if (x.value !== 0) snap(0);
    });
    return Gesture.Race(pan, tap);
  }, [armResetTimer, clearResetTimer, startX, x]);

  const sliding = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View style={styles.frame}>
      {/* Delete revealed by swiping left. */}
      <Press
        noScale
        accessibilityLabel="Delete"
        onPress={() => {
          snapTo(0);
          onDelete();
        }}
        style={[styles.action, { backgroundColor: deleteColor }]}
      >
        <Trash2 size={20} strokeWidth={2} color={colors.white} />
      </Press>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[style, sliding]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // relative overflow-hidden rounded-card
  frame: { position: "relative", overflow: "hidden", borderRadius: radius.card },
  // absolute inset-y-0 right-0 flex items-center justify-center text-white
  action: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: ACTION_W,
    alignItems: "center",
    justifyContent: "center",
  },
});
