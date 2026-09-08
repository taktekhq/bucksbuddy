import { forwardRef } from "react";
import { Platform, TextInput, type TextInputProps } from "react-native";
import { colors } from "@/lib/theme";

// Every text field in the app goes through here, because a browser and React
// Native disagree about how to place text inside an input.
//
// Two things bite, and both make the text sit high or low rather than centred:
//
//   1. Tailwind's `text-base` sets a font size AND a line height. A browser
//      centres the line box inside the input; React Native does not — it
//      positions the glyphs within a taller box and the text drifts off
//      centre. So input classes use an arbitrary size (`text-[16px]`), which
//      Tailwind emits *without* a line height, and the platform centres the
//      single line itself.
//   2. Android reserves extra room above and below the glyphs for ascenders
//      and descenders (`includeFontPadding`), which shifts short text down.
//
// `textAlignVertical` finishes the job on Android. Callers keep passing the
// web's classes; this component only fixes what the platform gets wrong.
//
// The caret is the third thing. iOS tints it from the app, but Android draws
// its own bright blue cursor, selection highlight and drag handles regardless —
// the one piece of stock Material blue in a carrot-orange app, and only ever on
// Android. The fields that already cared passed `selectionColor` themselves;
// this makes it the default for all of them (a caller's own value still wins,
// since `rest` is spread last).
const ANDROID_CARET = Platform.select({
  android: { selectionColor: colors.carrot, cursorColor: colors.carrot },
  default: undefined,
});

export const Input = forwardRef<TextInput, TextInputProps>(function Input(
  { style, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      textAlignVertical="center"
      {...ANDROID_CARET}
      style={[Platform.OS === "android" && { includeFontPadding: false }, style]}
      {...rest}
    />
  );
});
