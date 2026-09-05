import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

// Horizontal category bars for the Stats page. Purely presentational: callers
// map their numbers (cents or counts) to a formatted `value` and a `fraction`
// of the widest bar. On the web it inherits the observatory's `text-white`;
// text doesn't inherit here, so the two labels carry `text-white` themselves
// (PORTING §2a).

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
    <View className="flex flex-col gap-3">
      {items.map(({ id, label, icon: Icon, color, value, fraction }) => (
        // The web's `flex` is a row; React Native's default axis is the column,
        // so `flex-row` rides along with it wherever the web meant a row.
        <View key={id} className="flex flex-row items-center gap-3">
          <View
            className="flex flex-row h-8 w-8 shrink-0 items-center justify-center rounded-full"
            // Hex + "26" alpha ≈ 15% tint of the category color.
            style={{ backgroundColor: `${color}26` }}
          >
            {/* `text-...` on the parent colored the icon on the web; here the
                category color is a prop, and `h-4 w-4` is `size={16}`. */}
            <Icon size={16} strokeWidth={2} color={color} />
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex flex-row items-baseline justify-between gap-2">
              <Text className="truncate text-sm font-semibold text-white" numberOfLines={1}>
                {label}
              </Text>
              <Text className="font-numeric text-sm font-bold tabular-nums text-white">
                {value}
              </Text>
            </View>
            <View className="mt-1 h-1.5 overflow-hidden rounded-pill bg-white/10">
              <View
                className="h-full rounded-pill"
                // Even the smallest category gets a visible sliver.
                style={{
                  width: `${Math.max(fraction * 100, 2)}%`,
                  backgroundColor: color,
                }}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
