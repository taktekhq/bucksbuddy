import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";
import { useStore } from "@/lib/store";
import { colors, numeric, radius, shadowCard } from "@/lib/theme";

// An inset grouped row: label left, value input right. Saves on blur (no button)
// and flashes a green check, matching the iOS settings feel.
export function RateEditor() {
  const { lbpPerUsd, setRate } = useStore();
  const [value, setValue] = useState(String(lbpPerUsd));
  const [saved, setSaved] = useState(false);
  const [focused, setFocused] = useState(false);

  async function commit() {
    setFocused(false);
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setValue(String(lbpPerUsd)); // revert junk
      return;
    }
    if (n === lbpPerUsd) return;
    await setRate(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>LBP per $1</Text>
        <View style={styles.right}>
          {saved && <Check size={16} strokeWidth={3} color={colors.income} />}
          <TextInput
            keyboardType="number-pad"
            value={value}
            onChangeText={(t) => setValue(t.replace(/[^0-9]/g, ""))}
            onFocus={() => setFocused(true)}
            onBlur={commit}
            style={[styles.input, focused && styles.inputFocused]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...shadowCard,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: { fontSize: 16, lineHeight: 24, color: colors.label },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    ...numeric,
    width: 112,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: "right",
    fontSize: 16,
    color: colors.label,
  },
  inputFocused: {
    borderColor: "rgba(245,99,0,0.4)",
    borderWidth: 2,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
});
