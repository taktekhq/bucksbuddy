import type { ReactNode } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { colors, display, space, text, trackingWide } from "@/lib/theme";

// The small grey Grobold label that titles each section ("History", "Account",
// the hero's Bugs-ism). Grobold lives on grey only — see DESIGN_SYSTEM.md.
//
// Web: `px-2 font-display text-sm font-semibold uppercase tracking-wide
// text-label-secondary`. The `font-semibold` is dropped on purpose: Grobold
// ships one weight and the web disables synthetic bold (font-synthesis: none).
export function SectionHeader({
  children,
  style,
}: {
  children: ReactNode;
  /** The web's `className` — extra spacing like `mb-1`. */
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.header, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  header: {
    ...display,
    ...text.sm,
    paddingHorizontal: space(2),
    letterSpacing: trackingWide(text.sm.fontSize),
    color: colors.labelSecondary,
  },
});
