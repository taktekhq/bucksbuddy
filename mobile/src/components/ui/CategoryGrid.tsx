import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Press } from "@/components/ui/Press";
import type { Category } from "@/lib/categories";
import { colors, radius, space, text, weight, withAlpha } from "@/lib/theme";

type Props = {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string) => void;
};

// grid-cols-3 gap-2.5
const COLS = 3;
const GAP = space(2.5);

// 3-col colorful tiles: selected fills with the category color, the rest sit on
// a soft tint of their own color. A small dot marks tiles that open into
// subcategories (Health → Pharmacy, Fees → Mobile, …).
export function CategoryGrid({ categories, selected, onSelect }: Props) {
  // Measure the row so every tile is exactly a third of it, gaps included —
  // percentage widths don't account for `gap`. Until the first layout the
  // tiles are drawn at zero width, so nothing wraps wrongly for a frame.
  const [width, setWidth] = useState(0);
  const tileWidth = width > 0 ? (width - GAP * (COLS - 1)) / COLS : 0;

  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {categories.map((c) => {
        const active = c.id === selected;
        const Icon = c.icon;
        const fg = active ? colors.white : c.color;
        const hasSubs = (c.subcategories?.length ?? 0) > 0;
        return (
          <Press
            key={c.id}
            onPress={() => onSelect(c.id)}
            style={[
              styles.tile,
              { width: tileWidth, backgroundColor: active ? c.color : withAlpha(c.color, 0.1) },
            ]}
          >
            {hasSubs && (
              <View
                accessibilityElementsHidden
                style={[styles.dot, { backgroundColor: active ? colors.white : c.color }]}
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
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5), // gap-1.5
    borderRadius: radius.card,
    paddingVertical: space(5), // py-5
  },
  dot: {
    position: "absolute",
    right: space(2), // right-2
    top: space(2), // top-2
    width: 6, // h-1.5 w-1.5
    height: 6,
    borderRadius: radius.pill,
    opacity: 0.7,
  },
  label: {
    ...text.xs,
    fontWeight: weight.medium,
  },
});
