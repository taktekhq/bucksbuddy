import React from "react";

// A lightweight stand-in for framer-motion so component tests can drive the
// drag/gesture handlers deterministically in jsdom (where real pointer-driven
// dragging isn't available).
//
// - `useMotionValue` is a tiny get/set box.
// - `animate(value, target)` resolves immediately by setting the value, which
//   matches what the components rely on (reading `x.get()` after a snap).
// - `motion.<tag>` renders the plain DOM tag and stashes the gesture handlers
//   on the node as `__motion` so tests can invoke onDrag/onDragStart/onDragEnd.
//   `onClick` is forwarded as a real prop so fireEvent.click works normally.

export type MotionValue<T = number> = {
  get: () => T;
  set: (v: T) => void;
};

export function useMotionValue<T = number>(initial: T): MotionValue<T> {
  const ref = React.useRef<{ value: T }>({ value: initial });
  return {
    get: () => ref.current.value,
    set: (v: T) => {
      ref.current.value = v;
    },
  };
}

export function animate(value: MotionValue, target: number) {
  if (value && typeof value.set === "function") value.set(target);
  return { stop: () => {} };
}

export const AnimatePresence = ({ children }: { children?: React.ReactNode }) => (
  <>{children}</>
);

function createMotionComponent(tag: string) {
  const Component = React.forwardRef<HTMLElement, Record<string, unknown>>(
    (props, ref) => {
      const {
        drag,
        dragConstraints,
        dragElastic,
        dragMomentum,
        onDrag,
        onDragStart,
        onDragEnd,
        initial,
        animate: _animate,
        exit,
        transition,
        whileTap,
        whileHover,
        layout,
        style,
        children,
        ...rest
      } = props as Record<string, unknown> & {
        style?: Record<string, unknown>;
        children?: React.ReactNode;
      };

      // `style.x` may be a MotionValue object — strip it so React doesn't choke.
      const cleanStyle: Record<string, unknown> = { ...(style ?? {}) };
      if (cleanStyle && typeof cleanStyle.x === "object") delete cleanStyle.x;

      void drag;
      void dragConstraints;
      void dragElastic;
      void dragMomentum;
      void initial;
      void _animate;
      void exit;
      void transition;
      void whileTap;
      void whileHover;
      void layout;

      return React.createElement(
        tag,
        {
          ...rest,
          style: cleanStyle,
          ref: (node: HTMLElement | null) => {
            if (node) {
              (node as unknown as { __motion: unknown }).__motion = {
                onDrag,
                onDragStart,
                onDragEnd,
              };
            }
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
          },
        },
        children as React.ReactNode,
      );
    },
  );
  Component.displayName = `motion.${tag}`;
  return Component;
}

export const motion: Record<string, ReturnType<typeof createMotionComponent>> =
  new Proxy(
    {},
    {
      get: (_target, tag: string) => createMotionComponent(tag),
    },
  ) as Record<string, ReturnType<typeof createMotionComponent>>;

export type PanInfo = {
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
};

export default { useMotionValue, animate, AnimatePresence, motion };
