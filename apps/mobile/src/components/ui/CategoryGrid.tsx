import { Pressable, Text, View } from "react-native";

import { resolveCategoryIcon } from "@/lib/categoryIcons";
import type { Category } from "@bucksbuddy/core/categories";

type Props = {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string) => void;
};

// 3-col colorful tiles: selected fills with the category color, the rest sit on
// a soft tint of their own color. A small dot marks tiles that open into
// subcategories (Health → Pharmacy, Fees → Mobile, …). Mirrors
// src/components/ui/CategoryGrid.tsx.
export function CategoryGrid({ categories, selected, onSelect }: Props) {
  return (
    <View className="flex-row flex-wrap gap-2.5">
      {categories.map((c) => {
        const active = c.id === selected;
        const Icon = resolveCategoryIcon(c.icon);
        const fg = active ? "#FFFFFF" : c.color;
        const hasSubs = (c.subcategories?.length ?? 0) > 0;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            onPress={() => onSelect(c.id)}
            style={{ backgroundColor: active ? c.color : `${c.color}1A`, width: "31%" }}
            className="items-center justify-center gap-1.5 rounded-card py-5"
          >
            {hasSubs && (
              <View
                pointerEvents="none"
                style={{ backgroundColor: active ? "#FFFFFF" : c.color, opacity: 0.7 }}
                className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
              />
            )}
            <Icon size={28} strokeWidth={2} color={fg} />
            <Text style={{ color: fg }} className="text-xs font-medium">
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
