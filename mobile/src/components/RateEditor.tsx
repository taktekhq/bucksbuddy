import { useState } from "react";
import { Text, View } from "react-native";
import { Input } from "@/components/ui/Input";
import { Check } from "lucide-react-native";
import { useStore } from "@/lib/store";
import { colors } from "@/lib/theme";

// An inset grouped row: label left, value input right. Saves on blur (no button)
// and flashes a green check, matching the iOS settings feel.
export function RateEditor() {
  const { lbpPerUsd, setRate } = useStore();
  const [value, setValue] = useState(String(lbpPerUsd));
  const [saved, setSaved] = useState(false);

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
    // `overflow-hidden rounded-card bg-surface shadow-card` in one class string
    // clips its own shadow away on native, so the shadow stays on this wrapper
    // and the clip moves to the inner view with the same rounding.
    <View className="rounded-card bg-surface shadow-card">
      <View className="overflow-hidden rounded-card">
        <View className="flex flex-row items-center justify-between gap-3 px-4 py-3">
          {/* <label htmlFor="rate"> — the association is the input's a11y label. */}
          <Text className="text-base text-label">LBP per $1</Text>
          <View className="flex flex-row items-center gap-2">
            {saved && <Check size={16} strokeWidth={3} color={colors.income} />}
            <Input
              keyboardType="number-pad"
              value={value}
              onChangeText={(t) => setValue(t.replace(/[^0-9]/g, ""))}
              onBlur={() => void commit()}
              accessibilityLabel="LBP per $1"
              selectionColor={colors.carrot}
              className="w-28 rounded-lg border border-separator px-3 py-2 text-right text-[16px] tabular-nums text-label transition focus:border-carrot/40"
            />
          </View>
        </View>
      </View>
    </View>
  );
}
