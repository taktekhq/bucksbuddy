import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Trash2 } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { radius } from "@/lib/theme";

// Swipe a row left to reveal a Delete action — same mechanic as the main
// HistoryList, but delete-only (no edit). The content must be opaque so the
// action stays hidden until revealed.
const ACTION_W = 76; // px revealed
const AUTO_RESET_MS = 2000; // close an open row if no action is taken
// Light, crisp snap — quick tween, no springy overshoot.
const SNAP = { duration: 160, easing: Easing.bezier(0.2, 0, 0, 1) };

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

  function clearResetTimer() {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }

  function snapTo(target: number) {
    x.value = withTiming(target, SNAP);
    clearResetTimer();
    if (target !== 0) {
      resetTimer.current = setTimeout(() => snapTo(0), AUTO_RESET_MS);
    }
  }

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
      // Clamp to the revealed width with a little give past it (dragElastic).
      const over = next > 0 ? next : next < -ACTION_W ? next + ACTION_W : 0;
      x.value = Math.max(Math.min(next, 0), -ACTION_W) + over * 0.06;
    })
    .onEnd((e) => {
      const projected = x.value + e.velocityX * 0.08;
      runOnJS(snapTo)(projected <= -ACTION_W / 2 ? -ACTION_W : 0);
    });

  const tap = Gesture.Tap().onEnd(() => {
    if (x.value !== 0) runOnJS(snapTo)(0);
  });

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View style={styles.outer}>
      {/* Delete revealed by swiping left. */}
      <Press
        accessibilityLabel="Delete"
        onPress={() => {
          snapTo(0);
          onDelete();
        }}
        style={[styles.action, { backgroundColor: deleteColor }]}
      >
        <Trash2 size={20} strokeWidth={2} color="#FFF" />
      </Press>

      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <Animated.View style={[animated, style]}>{children}</Animated.View>
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
    right: 0,
    width: ACTION_W,
    alignItems: "center",
    justifyContent: "center",
  },
});
