import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Press } from "@/components/ui/Press";
import type { Category } from "@/lib/categories";
import { radius, withAlpha } from "@/lib/theme";

type Props = {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string) => void;
};

const COLS = 3;
const GAP = 10; // gap-2.5

// 3-col colorful tiles: selected fills with the category color, the rest sit on
// a soft tint of their own color. A small dot marks tiles that open into
// subcategories (Health → Pharmacy, Fees → Mobile, …).
export function CategoryGrid({ categories, selected, onSelect }: Props) {
  // Measure once so the tiles come out exactly a third of the row, gaps
  // included — flexBasis percentages don't account for `gap`.
  const [width, setWidth] = useState(0);
  const tileW = width > 0 ? (width - GAP * (COLS - 1)) / COLS : undefined;

  return (
    <View
      style={styles.grid}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {categories.map((c) => {
        const active = c.id === selected;
        const Icon = c.icon;
        const fg = active ? "#FFFFFF" : c.color;
        const hasSubs = (c.subcategories?.length ?? 0) > 0;
        return (
          <Press
            key={c.id}
            onPress={() => onSelect(c.id)}
            style={[
              styles.tile,
              { width: tileW, backgroundColor: active ? c.color : withAlpha(c.color, 0.1) },
            ]}
          >
            {hasSubs && (
              <View
                style={[
                  styles.dot,
                  { backgroundColor: active ? "#FFFFFF" : c.color },
                ]}
              />
            )}
            <Icon size={28} strokeWidth={2} color={fg} />
            <Text style={[styles.label, { color: fg }]}>{c.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.card,
    paddingVertical: 20,
    position: "relative",
  },
  dot: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.7,
  },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
});
