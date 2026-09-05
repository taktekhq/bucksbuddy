import { StyleSheet, Text, View } from "react-native";
import { formatSignedUsdCents, netColor } from "@/lib/money";
import { colors, numeric } from "@/lib/theme";

// Clean Apple stat: a small caption on top, the net number below it,
// green/red by direction. Left-aligned. When `masked` (the device is locked),
// the number is obscured.
export function NetTotal({
  cents,
  label,
  masked = false,
}: {
  cents: number;
  label: string;
  masked?: boolean;
}) {
  return (
    <View>
      <Text style={styles.caption}>{label}</Text>
      <Text
        style={[
          styles.value,
          { color: masked ? colors.labelMuted : netColor(cents) },
        ]}
      >
        {masked ? "$•••••" : formatSignedUsdCents(cents)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.labelSecondary,
  },
  value: {
    ...numeric,
    marginTop: 4,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "700",
  },
});
