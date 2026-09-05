import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, numeric, radius, text, weight, white, withAlpha } from "@/lib/theme";

// Horizontal category bars for the Stats page. Purely presentational: callers
// map their numbers (cents or counts) to a formatted `value` and a `fraction`
// of the widest bar. White text, so it sits on the dark screen as-is.

export type StatBarItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  value: string; // right-aligned, already formatted ("$12.50" or "×4")
  fraction: number; // 0..1 of the widest bar
};

export function StatBars({ items }: { items: StatBarItem[] }) {
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Bar key={item.id} item={item} />
      ))}
    </View>
  );
}

// Tailwind's default transition curve, for the bars growing in.
const EASE = Easing.bezier(0.4, 0, 0.2, 1);
const GROW_MS = 300;

// One row. Owns its shared value (never create those per row from outside),
// so a category that survives a month switch eases to its new width while a
// fresh one grows in from zero.
const Bar = memo(function Bar({ item }: { item: StatBarItem }) {
  const { label, icon: Icon, color, value, fraction } = item;
  // Even the smallest category gets a visible sliver.
  const target = Math.max(fraction * 100, 2);
  const pct = useSharedValue(0);
  useEffect(() => {
    pct.value = withTiming(target, { duration: GROW_MS, easing: EASE });
  }, [pct, target]);
  const fill = useAnimatedStyle(() => ({ width: `${pct.value}%` }));

  return (
    <View style={styles.row}>
      <View
        // Hex + "26" alpha ≈ 15% tint of the category color.
        style={[styles.badge, { backgroundColor: withAlpha(color, 0.15) }]}
      >
        <Icon size={16} strokeWidth={2} color={color} />
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.value}>{value}</Text>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  list: { gap: 12 }, // gap-3
  row: { flexDirection: "row", alignItems: "center", gap: 12 }, // gap-3
  badge: {
    width: 32, // h-8 w-8
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  line: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8, // gap-2
  },
  label: { ...text.sm, flexShrink: 1, fontWeight: weight.semibold, color: colors.white },
  value: { ...numeric, ...text.sm, fontWeight: weight.bold, color: colors.white },
  track: {
    marginTop: 4, // mt-1
    height: 6, // h-1.5
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: white(0.1),
  },
  fill: { height: "100%", borderRadius: radius.pill },
});
