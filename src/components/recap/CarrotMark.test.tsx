import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CarrotMark } from "@/components/recap/CarrotMark";

function renderMark(props: { x?: number; y?: number; size?: number } = {}) {
  const { container } = render(
    <svg>
      <CarrotMark {...props} />
    </svg>,
  );
  return container.querySelector("g")!;
}

describe("CarrotMark", () => {
  it("sits at the origin at its native 48px by default", () => {
    const g = renderMark();
    expect(g).toHaveAttribute("transform", "translate(0 0) scale(1)");
  });

  it("moves to x/y and scales relative to 48px", () => {
    const g = renderMark({ x: 10, y: 20, size: 24 });
    expect(g).toHaveAttribute("transform", "translate(10 20) scale(0.5)");
    expect(renderMark({ size: 96 })).toHaveAttribute("transform", "translate(0 0) scale(2)");
  });

  it("is decorative: hidden from assistive tech, drawn as vector paths", () => {
    const g = renderMark();
    expect(g).toHaveAttribute("aria-hidden", "true");
    // Paths, not text or an emoji, so the PNG looks the same on every phone.
    expect(g.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(g.textContent).toBe("");
  });
});
