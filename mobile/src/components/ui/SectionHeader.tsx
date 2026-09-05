import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { colors, display, space } from "@/lib/theme";

// The small grey Grobold label that titles each section ("History", "Account",
// the hero's Bugs-ism). Grobold lives on grey only — see DESIGN_SYSTEM.md.
export function SectionHeader({
  children,
  style,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.header, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  header: {
    ...display,
    paddingHorizontal: space(2),
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.35, // tracking-wide
    color: colors.labelSecondary,
  },
});
