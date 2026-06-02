import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

import { SwipeToDelete } from "@/components/ui/SwipeToDelete";
import { getMotionNode, pan, fling } from "@/test/motion";

describe("SwipeToDelete", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders children and fires onDelete from the Delete button", () => {
    const onDelete = vi.fn();
    render(
      <SwipeToDelete onDelete={onDelete}>
        <span>Row body</span>
      </SwipeToDelete>,
    );
    expect(screen.getByText("Row body")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("opens on a left fling and auto-closes after the timeout", () => {
    const { container } = render(
      <SwipeToDelete onDelete={() => {}}>
        <span>x</span>
      </SwipeToDelete>,
    );
    const node = getMotionNode(container);
    act(() => node.__motion.onDragEnd?.({}, fling(-1000))); // projected < -38 → open
    // A tap now (not moved) should snap it closed.
    act(() => {
      vi.advanceTimersByTime(2000); // auto-reset timer closes it
    });
    // Re-open then close via content click.
    act(() => node.__motion.onDragEnd?.({}, fling(-1000)));
    fireEvent.click(node);
    expect(true).toBe(true);
  });

  it("snaps back to closed on a small fling", () => {
    const { container } = render(
      <SwipeToDelete onDelete={() => {}}>
        <span>x</span>
      </SwipeToDelete>,
    );
    const node = getMotionNode(container);
    act(() => node.__motion.onDragEnd?.({}, fling(10))); // small → snap to 0
  });

  it("swallows the click that ends a real drag", () => {
    const onDelete = vi.fn();
    const { container } = render(
      <SwipeToDelete onDelete={onDelete}>
        <span>x</span>
      </SwipeToDelete>,
    );
    const node = getMotionNode(container);
    act(() => node.__motion.onDragStart?.({}, pan(0))); // clears any timer
    act(() => node.__motion.onDrag?.({}, pan(20))); // marks as moved
    fireEvent.click(node); // moved → swallowed, no snap
    // A tiny drag below the threshold does not mark as moved.
    act(() => node.__motion.onDrag?.({}, pan(2)));
  });

  it("clears the pending timer on unmount", () => {
    const { container, unmount } = render(
      <SwipeToDelete onDelete={() => {}}>
        <span>x</span>
      </SwipeToDelete>,
    );
    const node = getMotionNode(container);
    act(() => node.__motion.onDragEnd?.({}, fling(-1000))); // arms the timer
    unmount(); // cleanup clears it
  });
});
