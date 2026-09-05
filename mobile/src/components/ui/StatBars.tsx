import { StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { numeric, radius, white, withAlpha } from "@/lib/theme";

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
      {items.map(({ id, label, icon: Icon, color, value, fraction }) => (
        <View key={id} style={styles.row}>
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
              <View
                // Even the smallest category gets a visible sliver.
                style={[
                  styles.fill,
                  { width: `${Math.max(fraction * 100, 2)}%`, backgroundColor: color },
                ]}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  line: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  label: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#FFF" },
  value: { ...numeric, fontSize: 14, lineHeight: 20, fontWeight: "700", color: "#FFF" },
  track: {
    marginTop: 4,
    height: 6,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: white(0.1),
  },
  fill: { height: "100%", borderRadius: radius.pill },
});
