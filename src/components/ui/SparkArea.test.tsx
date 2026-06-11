import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SparkArea, buildAreaPath } from "@/components/ui/SparkArea";

describe("buildAreaPath", () => {
  it("returns null when there aren't two points to connect", () => {
    expect(buildAreaPath([])).toBeNull();
    expect(buildAreaPath([5])).toBeNull();
  });

  it("maps values onto the viewBox, padded so the stroke isn't clipped", () => {
    // 0 sits on the floor (y=31), the max touches the ceiling (y=1); the
    // segment between them is a Catmull-Rom curve with clamped end tangents.
    const paths = buildAreaPath([0, 10]);
    expect(paths?.line).toBe("M0 31 C16.67 26 83.33 6 100 1");
    expect(paths?.area).toBe(
      "M0 31 C16.67 26 83.33 6 100 1 L100 32 L0 32 Z",
    );
  });

  it("draws a flat floor for an all-zero series instead of dividing by zero", () => {
    expect(buildAreaPath([0, 0, 0])?.line).toBe(
      "M0 31 C8.33 31 33.33 31 50 31 C66.67 31 91.67 31 100 31",
    );
  });
});

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
