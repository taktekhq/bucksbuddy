// Adapted from the web's src/components/ui/SparkArea.test.tsx. The
// `buildAreaPath` assertions are the web's, character for character — the
// curve has to be the same shape in both apps, so the same path strings are
// the whole point of this file. The component assertions swap the web's DOM
// queries for the react-native-svg host nodes.
import { render, screen } from "@testing-library/react-native";
import { SparkArea, buildAreaPath } from "@/components/ui/SparkArea";

type Node = { type: string; props: Record<string, unknown>; children: unknown[] | null };

function allNodes(root: unknown): Node[] {
  if (!root || typeof root !== "object") return [];
  const node = root as Node;
  return [node, ...(node.children ?? []).flatMap(allNodes)];
}

const paths = () => allNodes(screen.toJSON()).filter((n) => n.type === "RNSVGPath");

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
    expect(paths?.area).toBe("M0 31 C16.67 26 83.33 6 100 1 L100 32 L0 32 Z");
  });

  it("draws a flat floor for an all-zero series instead of dividing by zero", () => {
    expect(buildAreaPath([0, 0, 0])?.line).toBe(
      "M0 31 C8.33 31 33.33 31 50 31 C66.67 31 91.67 31 100 31",
    );
  });

  it("closes the area back down to the floor across the full width", () => {
    const built = buildAreaPath([1, 2, 3]);
    expect(built?.area).toBe(`${built?.line} L100 32 L0 32 Z`);
  });

  it("spaces the points evenly across the viewBox width", () => {
    // Five points → four steps of 25.
    const line = buildAreaPath([1, 1, 1, 1, 1])?.line ?? "";
    expect(line.startsWith("M0 1")).toBe(true);
    expect(line.endsWith("100 1")).toBe(true);
    expect(line.match(/ C/g)).toHaveLength(4);
  });

  it("clamps a control point that would dip under the floor", () => {
    // A drop straight to zero that then flattens: the unclamped tangent puts
    // the second segment's first control point at y = 36, below the 31 floor.
    expect(buildAreaPath([100, 0, 0])?.line).toBe(
      "M0 1 C8.33 6 33.33 26 50 31 C66.67 31 91.67 31 100 31",
    );
  });

  it("clamps a control point that would rise over the ceiling", () => {
    // The mirror case: the unclamped control point lands at y = -4, above the
    // 1pt ceiling, which would clip the stroke at the top of the box.
    expect(buildAreaPath([0, 100, 100])?.line).toBe(
      "M0 31 C8.33 26 33.33 6 50 1 C66.67 1 91.67 1 100 1",
    );
  });

  it("never emits a control point outside the padded box", () => {
    const line = buildAreaPath([0, 100, 0, 100, 0, 3, 90, 1])?.line ?? "";
    const ys = [...line.matchAll(/[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(31);
    }
  });

  it("scales against the series max, not an absolute scale", () => {
    // The shape of [0, 5] and [0, 5000] is identical — only the max differs.
    expect(buildAreaPath([0, 5])).toEqual(buildAreaPath([0, 5000]));
  });

  it("floors a series whose max is below 1, so a sliver isn't magnified", () => {
    // max is clamped to 1, so 0.5 draws at half height rather than the ceiling.
    expect(buildAreaPath([0, 0.5])?.line).toBe("M0 31 C16.67 28.5 83.33 18.5 100 16");
  });
});

describe("SparkArea", () => {
  it("renders the wash and the line", async () => {
    await render(<SparkArea values={[1, 2, 3]} stroke="#F56300" fill="#000" className="h-4" />);
    expect(paths()).toHaveLength(2);
    const [area, line] = paths();
    expect(area.props.d).toBe(buildAreaPath([1, 2, 3])?.area);
    expect(line.props.d).toBe(buildAreaPath([1, 2, 3])?.line);
    expect(line.props.strokeWidth).toBe(1.5);
  });

  it("renders only the wash when no stroke is given", async () => {
    await render(<SparkArea values={[1, 2, 3]} fill="#000" />);
    expect(paths()).toHaveLength(1);
    expect(paths()[0].props.d).toBe(buildAreaPath([1, 2, 3])?.area);
  });

  it("renders nothing for a single point", async () => {
    await render(<SparkArea values={[1]} stroke="#fff" fill="#000" />);
    expect(screen.toJSON()).toBeNull();
  });

  it("stretches to its box and stays out of the accessibility tree", async () => {
    await render(<SparkArea values={[1, 2]} fill="#000" />);
    const svg = allNodes(screen.toJSON()).find((n) => n.type === "RNSVGSvgView");
    // preserveAspectRatio="none" — the chart fills whatever box the caller gives it.
    expect(svg?.props.align).toBe("none");
    expect(svg?.props.vbWidth).toBe(100);
    expect(svg?.props.vbHeight).toBe(32);
    expect(svg?.props.pointerEvents).toBe("none");
    expect(svg?.props.accessible).toBe(false);
    expect(svg?.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
