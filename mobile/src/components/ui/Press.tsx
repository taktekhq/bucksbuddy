import { forwardRef, useCallback, type ReactNode } from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { motion } from "@/lib/theme";

// The web's `.press` class: transform 0.1s ease, scale(0.97) while active —
// plus `disabled:opacity-50` when the caller asks for it. Every tappable thing
// in the app goes through this so the feel stays uniform. The scale is driven
// on the UI thread by Reanimated, so it eases in and out instead of snapping.
type Props = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  /** Extra style while pressed (the web's `active:` classes). */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Opacity while disabled — the web's `disabled:opacity-50` = 0.5. */
  disabledOpacity?: number;
  /** Turn the scale feedback off (plain `<button>` on the web, no `.press`). */
  noScale?: boolean;
  children?: ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const EASE = Easing.inOut(Easing.ease);

export const Press = forwardRef<View, Props>(function Press(
  {
    style,
    pressedStyle,
    disabled,
    disabledOpacity,
    noScale = false,
    children,
    onPressIn,
    onPressOut,
    ...rest
  },
  ref,
) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleIn = useCallback(
    (e: GestureResponderEvent) => {
      if (!noScale) scale.value = withTiming(0.97, { duration: motion.press, easing: EASE });
      pressed.value = 1;
      onPressIn?.(e);
    },
    [noScale, onPressIn, pressed, scale],
  );
  const handleOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withTiming(1, { duration: motion.press, easing: EASE });
      pressed.value = 0;
      onPressOut?.(e);
    },
    [onPressOut, pressed, scale],
  );

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={({ pressed: isPressed }: { pressed: boolean }) => [
        style,
        animated,
        isPressed && pressedStyle,
        disabled && disabledOpacity != null && { opacity: disabledOpacity },
      ]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
