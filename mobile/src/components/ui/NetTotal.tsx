import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { formatSignedUsdCents, netColor } from "@/lib/money";
import { colors, motion, numeric, text, trackingWide, weight } from "@/lib/theme";

// Clean Apple stat: a small caption on top, the net number below it,
// green/red by direction. Left-aligned. When `masked` (the device is locked),
// the number is obscured.
//
// The colour is the web's `netColorClass` (green up, red down, label at zero,
// muted while masked). It's eased over `motion.transition` (150ms) on the UI
// thread instead of snapping, so a balance crossing zero — or the lock
// masking it — tints smoothly, the way the web's `transition` classes do.
export function NetTotal({
  cents,
  label,
  masked = false,
}: {
  cents: number;
  label: string;
  masked?: boolean;
}) {
  const target = masked ? colors.labelMuted : netColor(cents);

  const from = useSharedValue(target);
  const to = useSharedValue(target);
  const progress = useSharedValue(1);

  useEffect(() => {
    if (to.value === target) return;
    // Start from wherever the tween currently is, so a quick double change
    // doesn't jump back to the old colour.
    from.value = interpolateColor(progress.value, [0, 1], [from.value, to.value]);
    to.value = target;
    progress.value = 0;
    progress.value = withTiming(1, { duration: motion.transition });
  }, [target, from, to, progress]);

  const tint = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [from.value, to.value]),
  }));

  return (
    <View>
      <Text style={styles.caption}>{label}</Text>
      <Animated.Text style={[styles.value, tint]}>
        {masked ? "$•••••" : formatSignedUsdCents(cents)}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // text-[13px] font-medium uppercase tracking-wide text-label-secondary
  caption: {
    ...text["13"],
    fontWeight: weight.medium,
    textTransform: "uppercase",
    letterSpacing: trackingWide(text["13"].fontSize),
    color: colors.labelSecondary,
  },
  // mt-1 font-numeric text-4xl font-bold tabular-nums
  value: {
    ...numeric,
    ...text["4xl"],
    marginTop: 4,
    fontWeight: weight.bold,
  },
});
