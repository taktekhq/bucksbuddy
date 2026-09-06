import { forwardRef } from "react";
import { Platform, TextInput, type TextInputProps } from "react-native";

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
export const Input = forwardRef<TextInput, TextInputProps>(function Input(
  { style, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      textAlignVertical="center"
      style={[Platform.OS === "android" && { includeFontPadding: false }, style]}
      {...rest}
    />
  );
});
