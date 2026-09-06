import { useState } from "react";
import { Text, View } from "react-native";
import { Press } from "@/components/ui/Press";
import type { Category } from "@/lib/categories";

type Props = {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string) => void;
};

// `grid grid-cols-3 gap-2.5` — React Native has no CSS grid, so the row wraps
// and each tile gets an explicit width measured off the container (PORTING §4):
// three columns with two 10px gaps between them.
const COLS = 3;
const GAP = 10; // gap-2.5

// 3-col colorful tiles: selected fills with the category color, the rest sit on
// a soft tint of their own color. A small dot marks tiles that open into
// subcategories (Health → Pharmacy, Fees → Mobile, …).
export function CategoryGrid({ categories, selected, onSelect }: Props) {
  const [width, setWidth] = useState(0);
  const tileWidth = width > 0 ? (width - GAP * (COLS - 1)) / COLS : 0;

  return (
    <View
      className="flex-row flex-wrap gap-2.5"
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
            className="relative flex flex-col items-center justify-center gap-1.5 rounded-card py-5"
            style={{ width: tileWidth, backgroundColor: active ? c.color : `${c.color}1A` }}
          >
            {hasSubs && (
              <View
                accessible={false}
                className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: active ? "#FFFFFF" : c.color, opacity: 0.7 }}
              />
            )}
            <Icon size={28} strokeWidth={2} color={fg} />
            <Text className="text-center text-xs font-medium" style={{ color: fg }}>
              {c.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}
