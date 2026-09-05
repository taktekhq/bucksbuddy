import { Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

// Pages a month-scoped view between months: a left chevron that walks back as
// far as there's data, a centered month label, and a right chevron that returns
// toward the present and stops there. Mirrors
// src/components/ui/MonthSwitcher.tsx.
export function MonthSwitcher({
  label,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-card bg-white/10 px-2 py-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        onPress={onPrev}
        disabled={!canPrev}
        style={{ opacity: canPrev ? 1 : 0.25 }}
        className="-m-1 p-2"
      >
        <ChevronLeft size={20} strokeWidth={2.5} color="#F56300" />
      </Pressable>
      <Text className="font-display text-sm font-bold uppercase tracking-wide text-white/90">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        onPress={onNext}
        disabled={!canNext}
        style={{ opacity: canNext ? 1 : 0.25 }}
        className="-m-1 p-2"
      >
        <ChevronRight size={20} strokeWidth={2.5} color="#F56300" />
      </Pressable>
    </View>
  );
}
