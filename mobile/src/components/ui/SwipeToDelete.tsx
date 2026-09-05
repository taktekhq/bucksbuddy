import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { View } from "react-native";
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
import { colors, motion } from "@/lib/theme";

// Swipe a row left to reveal a Delete action — same mechanic as the main
// HistoryList, but delete-only (no edit). The content must be opaque so the
// action stays hidden until revealed.
const ACTION_W = 76; // px revealed
const AUTO_RESET_MS = 2000; // close an open row if no action is taken
const SNAP = { duration: motion.snap, easing: Easing.bezier(...motion.snapEase) };

export function SwipeToDelete({
  onDelete,
  className = "",
  deleteColor = "#FF3B30",
  children,
}: {
  onDelete: () => void;
  className?: string;
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
    // The offsets keep the row usable inside a scrolling page: horizontal
    // intent activates the pan, vertical drift fails it back to the scroll.
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
        // dragConstraints { left: -ACTION_W, right: 0 }, dragElastic 0.06,
        // no momentum.
        const clamped = Math.max(-ACTION_W, Math.min(0, next));
        x.value = clamped + (next - clamped) * 0.06;
      })
      .onEnd((e) => {
        const projected = x.value + e.velocityX * 0.08;
        if (projected <= -ACTION_W / 2) snap(-ACTION_W);
        else snap(0);
      })
      .onFinalize((_e, success) => {
        // A drag cancelled mid-way (the page took the touch) must not leave
        // the row hanging between positions.
        if (success) return;
        const v = x.value;
        if (v === 0 || v === -ACTION_W) return;
        snap(v <= -ACTION_W / 2 ? -ACTION_W : 0);
      });
    // The web's `onClick` on the content: a tap on an open row closes it.
    const tap = Gesture.Tap().onEnd(() => {
      if (x.value !== 0) snap(0);
    });
    return Gesture.Race(pan, tap);
  }, [armResetTimer, clearResetTimer, startX, x]);

  const sliding = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View className="relative overflow-hidden rounded-card">
      {/* Delete revealed by swiping left. */}
      <Press
        noScale
        accessibilityLabel="Delete"
        onPress={() => {
          snapTo(0);
          onDelete();
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center text-white"
        style={{ width: ACTION_W, backgroundColor: deleteColor }}
      >
        <Trash2 size={20} strokeWidth={2} color={colors.white} />
      </Press>

      {/* The sliding content is the last child, so the frame's clipping keeps
          the action hidden behind it until it moves. */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={sliding} className={`relative ${className}`}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
