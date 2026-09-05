import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Check } from "lucide-react-native";
import { useStore } from "@/lib/store";
import { colors, motion, numeric, radius, shadows, space, text } from "@/lib/theme";

// An inset grouped row: label left, value input right. Saves on blur (no button)
// and flashes a green check, matching the iOS settings feel.
export function RateEditor() {
  const { lbpPerUsd, setRate } = useStore();
  const [value, setValue] = useState(String(lbpPerUsd));
  const [saved, setSaved] = useState(false);
  // The web's `focus:ring-2` — a 2px carrot ring while the field is focused.
  const [focused, setFocused] = useState(false);

  async function commit() {
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
      <View style={styles.clip}>
        <View style={styles.row}>
          <Text style={styles.label}>LBP per $1</Text>
          <View style={styles.right}>
            {saved && (
              <Animated.View
                entering={FadeIn.duration(motion.transition)}
                exiting={FadeOut.duration(motion.transition)}
              >
                <Check size={16} strokeWidth={3} color={colors.income} />
              </Animated.View>
            )}
            <TextInput
              keyboardType="number-pad"
              value={value}
              onChangeText={(t) => setValue(t.replace(/[^0-9]/g, ""))}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                void commit();
              }}
              accessibilityLabel="LBP per $1"
              selectionColor={colors.carrot}
              style={[styles.input, focused && styles.inputFocused]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // rounded-card bg-surface shadow-card — the shadow lives on this wrapper…
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  // …and overflow-hidden on the inner view, so clipping never eats the shadow.
  clip: { borderRadius: radius.card, overflow: "hidden" },
  // flex items-center justify-between gap-3 px-4 py-3
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space(3),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  // text-base text-label
  label: { ...text.base, color: colors.label },
  // flex items-center gap-2
  right: { flexDirection: "row", alignItems: "center", gap: space(2) },
  // w-28 rounded-lg border border-separator px-3 py-2 text-right text-base tabular-nums text-label
  // — 24px line + 8px padding + 1px border each side = 42 tall.
  input: {
    ...numeric,
    width: space(28),
    height: 42,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: space(3),
    paddingVertical: 0,
    textAlign: "right",
    textAlignVertical: "center",
    fontSize: 16,
    color: colors.label,
  },
  // focus:ring-2 ring-carrot/40 — 2px ring; padding gives back the extra pixel.
  inputFocused: {
    borderWidth: 2,
    borderColor: "rgba(245,99,0,0.4)",
    paddingHorizontal: space(3) - 1,
  },
});
