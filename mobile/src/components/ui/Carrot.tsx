import { Text, type StyleProp, type TextStyle } from "react-native";

type Props = {
  /** Emoji size in points (the web's text-6xl = 60, text-5xl = 48, text-2xl = 24). */
  size?: number;
  style?: StyleProp<TextStyle>;
};

// The mascot. We render the real 🥕 emoji on purpose — on Apple devices that's
// the exact orange carrot the user asked for, straight from the system emoji
// font. No custom SVG can match "the carrot from the Apple emojis." Static by
// design: the carrot sits still.
export function Carrot({ size = 48, style }: Props) {
  return (
    <Text
      accessibilityRole="image"
      accessibilityLabel="carrot"
      style={[{ fontSize: size, lineHeight: size * 1.15 }, style]}
    >
      🥕
    </Text>
  );
}
