import type { PanInfo } from "@/test/framerMock";

type MotionHandlers = {
  onDrag?: (e: unknown, info: PanInfo) => void;
  onDragStart?: (e: unknown, info: PanInfo) => void;
  onDragEnd?: (e: unknown, info: PanInfo) => void;
};

// Finds the (mocked) motion element — the one our framer mock tagged with
// `__motion` — inside a rendered container.
export function getMotionNode(container: HTMLElement): HTMLElement & {
  __motion: MotionHandlers;
} {
  const node = Array.from(container.querySelectorAll<HTMLElement>("*")).find(
    (el) => (el as unknown as { __motion?: unknown }).__motion,
  );
  if (!node) throw new Error("no motion node found");
  return node as HTMLElement & { __motion: MotionHandlers };
}

// The draggable motion element (one whose onDragEnd handler is wired up) —
// useful when a tree has several motion nodes (e.g. an overlay + a sheet).
export function getDraggableNode(container: HTMLElement): HTMLElement & {
  __motion: MotionHandlers;
} {
  const node = Array.from(container.querySelectorAll<HTMLElement>("*")).find(
    (el) => (el as unknown as { __motion?: MotionHandlers }).__motion?.onDragEnd,
  );
  if (!node) throw new Error("no draggable motion node found");
  return node as HTMLElement & { __motion: MotionHandlers };
}

export function panY(y: number, velocityY = 0): PanInfo {
  return { offset: { x: 0, y }, velocity: { x: 0, y: velocityY } };
}

export function pan(x: number): PanInfo {
  return { offset: { x, y: 0 }, velocity: { x: 0, y: 0 } };
}

export function fling(velocityX: number): PanInfo {
  return { offset: { x: 0, y: 0 }, velocity: { x: velocityX, y: 0 } };
}
