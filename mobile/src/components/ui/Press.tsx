import { forwardRef, type ReactNode } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";

// The web's `.press` class: light, quick feedback — scale to 0.97 while
// pressed, plus `disabled:opacity-50` when the caller asks for it. Every
// tappable thing in the app goes through this so the feel stays uniform.
type Props = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  disabledOpacity?: number;
  children?: ReactNode;
};

export const Press = forwardRef<View, Props>(function Press(
  { style, pressedStyle, disabled, disabledOpacity, children, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      style={({ pressed }) => [
        style,
        pressed && { transform: [{ scale: 0.97 }] },
        pressed && pressedStyle,
        disabled && disabledOpacity != null && { opacity: disabledOpacity },
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
});
