import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SparkArea } from "@/components/ui/SparkArea";

// buildAreaPath's own path-math tests live in
// packages/core/src/sparkline.test.ts, shared with native. This file only
// covers the DOM rendering on top of it.
describe("SparkArea", () => {
  it("renders the wash and the line", () => {
    const { container } = render(
      <SparkArea values={[1, 2, 3]} stroke="#F56300" fill="#000" className="h-4" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-4");
    expect(svg?.querySelectorAll("path")).toHaveLength(2);
  });

  it("renders only the wash when no stroke is given", () => {
    const { container } = render(<SparkArea values={[1, 2, 3]} fill="#000" />);
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("renders nothing for a single point", () => {
    const { container } = render(<SparkArea values={[1]} stroke="#fff" fill="#000" />);
    expect(container).toBeEmptyDOMElement();
  });
});
