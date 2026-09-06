// Adapted from the web's src/components/ui/StatBars.test.tsx — same items,
// same expectations about labels, values and bar widths. The web reads the
// widths off `div[style]`; here the bar is a View whose width is an inline
// style, so the same numbers are read off the rendered style.
import { render, screen } from "@testing-library/react-native";
import { Coffee, Fuel } from "lucide-react-native";
import { StatBars } from "@/components/ui/StatBars";

type Node = { type: string; props: Record<string, unknown>; children: unknown[] | null };

function allNodes(root: unknown): Node[] {
  if (!root || typeof root !== "object") return [];
  const node = root as Node;
  return [node, ...(node.children ?? []).flatMap(allNodes)];
}

/** The width of every bar, in document order. */
function barWidths(): string[] {
  return allNodes(screen.toJSON())
    .map((n) => (n.props.style ?? {}) as { width?: unknown })
    .filter((s) => typeof s.width === "string")
    .map((s) => s.width as string);
}

describe("StatBars", () => {
  it("renders a row per item with label, value and a proportional bar", async () => {
    await render(
      <StatBars
        items={[
          { id: "coffee", label: "Coffee", icon: Coffee, color: "#8B5E3C", value: "$3.50", fraction: 1 },
          { id: "gas", label: "Gas", icon: Fuel, color: "#FF3B30", value: "$1.75", fraction: 0.5 },
        ]}
      />,
    );
    expect(screen.getByText("Coffee")).toBeOnTheScreen();
    expect(screen.getByText("$3.50")).toBeOnTheScreen();
    expect(screen.getByText("Gas")).toBeOnTheScreen();
    expect(screen.getByText("$1.75")).toBeOnTheScreen();
    expect(barWidths()).toEqual(["100%", "50%"]);
  });

  it("keeps a visible sliver even for a near-zero fraction", async () => {
    await render(
      <StatBars
        items={[
          { id: "tips", label: "Tips", icon: Coffee, color: "#FFCC00", value: "$0.01", fraction: 0.0001 },
        ]}
      />,
    );
    expect(barWidths()).toEqual(["2%"]);
  });

  it("colors the bar and its icon halo with the category color", async () => {
    await render(
      <StatBars
        items={[
          { id: "gas", label: "Gas", icon: Fuel, color: "#FF3B30", value: "$1.75", fraction: 0.5 },
        ]}
      />,
    );
    const backgrounds = allNodes(screen.toJSON())
      .map((n) => (n.props.style ?? {}) as { backgroundColor?: unknown })
      .map((s) => s.backgroundColor)
      .filter((c): c is string => typeof c === "string");
    // The halo is the color at ~15% ("26"), the bar is the color itself.
    expect(backgrounds).toContain("#FF3B3026");
    expect(backgrounds).toContain("#FF3B30");
  });

  it("truncates a long label to one line rather than wrapping the row", async () => {
    await render(
      <StatBars
        items={[
          {
            id: "x",
            label: "A very long category label that would wrap",
            icon: Coffee,
            color: "#FFCC00",
            value: "×4",
            fraction: 1,
          },
        ]}
      />,
    );
    const label = screen.getByText("A very long category label that would wrap");
    expect(label.props.numberOfLines).toBe(1);
  });

  it("renders nothing for an empty list", async () => {
    await render(<StatBars items={[]} />);
    expect(barWidths()).toEqual([]);
  });
});
