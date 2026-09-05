import { StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Press } from "@/components/ui/Press";
import { colors, display, motion, radius, text, trackingWide, white } from "@/lib/theme";

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
      <Chevron enabled={canPrev} onPress={onPrev} accessibilityLabel="Previous month">
        <ChevronLeft size={20} strokeWidth={2.5} color={colors.carrot} />
      </Chevron>
      <Text style={styles.label}>{label}</Text>
      <Chevron enabled={canNext} onPress={onNext} accessibilityLabel="Next month">
        <ChevronRight size={20} strokeWidth={2.5} color={colors.carrot} />
      </Chevron>
    </View>
  );
}

// `press -m-1 p-2 text-carrot transition disabled:opacity-25` — the disabled
// fade eases over the web's `transition` (150ms) instead of snapping, so
// paging to the present dims the right chevron smoothly.
function Chevron({
  enabled,
  onPress,
  accessibilityLabel,
  children,
}: {
  enabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const fade = useAnimatedStyle(
    () => ({
      opacity: withTiming(enabled ? 1 : 0.25, { duration: motion.transition }),
    }),
    [enabled],
  );
  return (
    <Animated.View style={[styles.slot, fade]}>
      <Press
        onPress={onPress}
        disabled={!enabled}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !enabled }}
        hitSlop={6}
        style={styles.button}
      >
        {children}
      </Press>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 8, // px-2
    paddingVertical: 6, // py-1.5
  },
  slot: { margin: -4 }, // -m-1
  button: { padding: 8 }, // p-2
  label: {
    ...display,
    ...text.sm,
    letterSpacing: trackingWide(14),
    color: white(0.9),
  },
});
