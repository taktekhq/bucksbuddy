import { StyleSheet, Text, View } from "react-native";
import { Press } from "@/components/ui/Press";
import { colors, radius, shadowSegment, space } from "@/lib/theme";

type Props = {
  isIncome: boolean;
  onChange: (isIncome: boolean) => void;
};

// Segmented control on a plain Apple track. The active side fills with money
// color — red for Out, green for In — so direction reads instantly.
export function InOutToggle({ isIncome, onChange }: Props) {
  return (
    <View style={styles.track}>
      <Press
        onPress={() => onChange(false)}
        style={[styles.segment, !isIncome && styles.out]}
      >
        <Text style={[styles.label, !isIncome && styles.activeLabel]}>Out</Text>
      </Press>
      <Press
        onPress={() => onChange(true)}
        style={[styles.segment, isIncome && styles.in]}
      >
        <Text style={[styles.label, isIncome && styles.activeLabel]}>In</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: space(1),
    borderRadius: radius.pill,
    backgroundColor: colors.grouped,
    padding: space(1),
  },
  segment: {
    flex: 1,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  out: { backgroundColor: colors.expense, ...shadowSegment },
  in: { backgroundColor: colors.income, ...shadowSegment },
  label: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    color: colors.labelSecondary,
  },
  activeLabel: { color: colors.white },
});
