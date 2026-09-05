import { StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { colors, display, radius, white } from "@/lib/theme";

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
    <View style={styles.bar}>
      <Press
        onPress={onPrev}
        disabled={!canPrev}
        disabledOpacity={0.25}
        accessibilityLabel="Previous month"
        style={styles.button}
      >
        <ChevronLeft size={20} strokeWidth={2.5} color={colors.carrot} />
      </Press>
      <Text style={styles.label}>{label}</Text>
      <Press
        onPress={onNext}
        disabled={!canNext}
        disabledOpacity={0.25}
        accessibilityLabel="Next month"
        style={styles.button}
      >
        <ChevronRight size={20} strokeWidth={2.5} color={colors.carrot} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  button: { padding: 8, margin: -4 },
  label: {
    ...display,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.35,
    color: white(0.9),
  },
});
