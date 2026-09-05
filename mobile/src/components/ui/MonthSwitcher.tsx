import { Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { colors } from "@/lib/theme";

// Pages a month-scoped view between months: a left chevron that walks back as
// far as there's data, a centered month label, and a right chevron that returns
// toward the present and stops there. Shared by Stats (the observatory) and
// History (the rabbit hole) — both dark, so the white/carrot styling fits as-is.
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
    // The web's `flex` is a row; React Native's default axis is the column, so
    // `flex-row` rides along with it wherever the web meant a row.
    <View className="flex flex-row items-center justify-between rounded-card bg-white/10 px-2 py-1.5">
      <Press
        onPress={onPrev}
        disabled={!canPrev}
        accessibilityLabel="Previous month"
        className="-m-1 p-2 text-carrot transition disabled:opacity-25"
      >
        {/* `h-5 w-5` → size={20}; the color the web took from `text-carrot`
            on the button is a prop here (PORTING §2b). */}
        <ChevronLeft size={20} strokeWidth={2.5} color={colors.carrot} />
      </Press>
      <Text className="font-display text-sm font-bold uppercase tracking-wide text-white/90">
        {label}
      </Text>
      <Press
        onPress={onNext}
        disabled={!canNext}
        accessibilityLabel="Next month"
        className="-m-1 p-2 text-carrot transition disabled:opacity-25"
      >
        <ChevronRight size={20} strokeWidth={2.5} color={colors.carrot} />
      </Press>
    </View>
  );
}
