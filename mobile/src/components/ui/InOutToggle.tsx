import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Press } from "@/components/ui/Press";
import { colors, motion, radius, shadows, space, text, weight } from "@/lib/theme";

type Props = {
  isIncome: boolean;
  onChange: (isIncome: boolean) => void;
};

// grid-cols-2 gap-1 p-1
const GAP = space(1);
const PAD = space(1);

// Segmented control on a plain Apple track. The active side fills with money
// color — red for Out, green for In — so direction reads instantly.
//
// The web swaps classes and lets `transition` (150ms) blend them. Here the
// active fill is one highlight view that slides between the two halves and
// blends red↔green on the UI thread, so the change glides instead of snapping.
export function InOutToggle({ isIncome, onChange }: Props) {
  // 0 = Out (left), 1 = In (right).
  const progress = useSharedValue(isIncome ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(isIncome ? 1 : 0, { duration: motion.transition });
  }, [isIncome, progress]);

  // Measure the track so the highlight is exactly one half wide, gap included.
  const [trackWidth, setTrackWidth] = useState(0);
  const halfWidth = trackWidth > 0 ? (trackWidth - PAD * 2 - GAP) / 2 : 0;

  const highlight = useAnimatedStyle(() => ({
    width: halfWidth,
    opacity: halfWidth > 0 ? 1 : 0,
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.expense, colors.income]),
    transform: [{ translateX: progress.value * (halfWidth + GAP) }],
  }));
  const outLabel = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.white, colors.labelSecondary]),
  }));
  const inLabel = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.labelSecondary, colors.white]),
  }));

  return (
    <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
      {/* The active segment: bg-expense / bg-income + shadow-segment. */}
      <Animated.View pointerEvents="none" style={[styles.highlight, highlight]} />
      <Press onPress={() => onChange(false)} style={styles.segment}>
        <Animated.Text style={[styles.label, outLabel]}>Out</Animated.Text>
      </Press>
      <Press onPress={() => onChange(true)} style={styles.segment}>
        <Animated.Text style={[styles.label, inLabel]}>In</Animated.Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: "relative",
    flexDirection: "row",
    gap: GAP,
    borderRadius: radius.pill,
    backgroundColor: colors.grouped,
    padding: PAD,
  },
  highlight: {
    position: "absolute",
    left: PAD,
    top: PAD,
    bottom: PAD,
    borderRadius: radius.pill,
    boxShadow: shadows.segment,
  },
  segment: {
    flex: 1,
    borderRadius: radius.pill,
    paddingVertical: space(2.5), // py-2.5
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...text.base,
    fontWeight: weight.semibold,
  },
});
