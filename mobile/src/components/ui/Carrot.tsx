import { Image } from "react-native";

// The mascot, as a picture rather than a glyph.
const CARROT = require("../../../assets/carrot.png");

type Props = {
  /**
   * The mascot's size in points — what the web's font-size class resolves to
   * (`text-6xl` = 60, `text-5xl` = 48, `text-2xl` = 24). It stays a number
   * rather than a class because the web sized the emoji through its font size,
   * and every call site already passes the number that class means.
   */
  size?: number;
  className?: string;
};

// The mascot. This used to be the literal 🥕 character, on the theory that the
// system emoji font *is* the carrot the design asks for. That holds on Apple
// devices and nowhere else: Android renders the same code point from Noto Color
// Emoji, a flatter, blunter carrot with different leaves and a different
// orange, so the brand mark — the one thing on every screen — was a different
// drawing on half the installs.
//
// So it is Apple's artwork, shipped as an asset (`assets/carrot.png`, cut from
// the app icon and matted off its white background), and both platforms draw
// the identical mark.
//
// Sized as a square box with `contain`: the carrot is slightly taller than it
// is wide, so it fills the box's height and centres across its width — the same
// footprint the emoji had, without the line-height headroom a text glyph needed
// to avoid being clipped.
export function Carrot({ size = 48, className = "" }: Props) {
  return (
    <Image
      source={CARROT}
      accessibilityRole="image"
      accessibilityLabel="carrot"
      resizeMode="contain"
      className={className}
      // Not a class: the size is a prop, the same number the web's font-size
      // class resolves to.
      style={{ width: size, height: size }}
    />
  );
}
