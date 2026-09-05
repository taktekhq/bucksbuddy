import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

type Props = {
  /** Emoji size in points — the web's font-size class (text-6xl = 60, text-5xl = 48, text-2xl = 24). */
  size?: number;
  style?: StyleProp<TextStyle>;
};

// The mascot. We render the real 🥕 emoji on purpose — on Apple devices that's
// the exact orange carrot the user asked for, straight from the system emoji
// font. No custom SVG can match "the carrot from the Apple emojis." Static by
// design: the carrot sits still.
//
// The web's `leading-none` would be lineHeight = size, but the color emoji
// glyph overhangs its em box on both platforms and gets its top clipped at
// that height, so the line is ~1.15× and the emoji is centred inside it.
export function Carrot({ size = 48, style }: Props) {
  return (
    <Text
      accessibilityRole="image"
      accessibilityLabel="carrot"
      allowFontScaling={false}
      style={[styles.emoji, { fontSize: size, lineHeight: Math.round(size * 1.15) }, style]}
    >
      🥕
    </Text>
  );
}

const styles = StyleSheet.create({
  emoji: { textAlign: "center", includeFontPadding: false },
});
