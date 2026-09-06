import { forwardRef, type ReactNode } from "react";
import { Pressable, type PressableProps, type View } from "react-native";

// The web's `<button className="press …">`.
//
// `.press` is a CSS transition plus `:active { transform: scale(0.97) }`.
// NativeWind gives Pressable the same thing: the `active:` variant fires on
// press, and `transition`/`duration-*` drive it. Baked in here so every call
// site can stay as close to the web's markup as possible — a component that
// says `className="press …"` on the web says `<Press className="…">` here.
//
// Pass `noScale` for the web's plain `<button>` (no `.press` class).
type Props = Omit<PressableProps, "children"> & {
  className?: string;
  noScale?: boolean;
  children?: ReactNode;
};

const PRESS = "transition duration-100 active:scale-[0.97]";

export const Press = forwardRef<View, Props>(function Press(
  { className = "", noScale = false, children, ...rest },
  ref,
) {
  return (
    <Pressable ref={ref} className={`${noScale ? "" : PRESS} ${className}`} {...rest}>
      {children}
    </Pressable>
  );
});
