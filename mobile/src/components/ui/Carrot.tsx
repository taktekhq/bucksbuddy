import { Text } from "react-native";

type Props = {
  /**
   * Emoji size in points — what the web's font-size class resolves to
   * (`text-6xl` = 60, `text-5xl` = 48, `text-2xl` = 24). A Text's fontSize is
   * the only thing that drives an emoji's size, so it comes in as a number.
   */
  size?: number;
  className?: string;
};

// The mascot. We render the real 🥕 emoji on purpose — on Apple devices that's
// the exact orange carrot the user asked for, straight from the system emoji
// font. No custom SVG can match "the carrot from the Apple emojis." Static by
// design: the carrot sits still.
//
// The web's `leading-none` would be lineHeight = size, but the color emoji
// glyph overhangs its em box on both platforms and gets its top clipped at
// that height, so the line is ~1.15× and the emoji is centred inside it.
export function Carrot({ size = 48, className = "" }: Props) {
  return (
    <Text
      accessibilityRole="image"
      accessibilityLabel="carrot"
      allowFontScaling={false}
      className={`text-center ${className}`}
      // Not a class: the size is a prop, and `includeFontPadding` (Android's
      // extra glyph padding, which shifts the emoji off-centre) has none.
      style={{ fontSize: size, lineHeight: Math.round(size * 1.15), includeFontPadding: false }}
    >
      🥕
    </Text>
  );
}
