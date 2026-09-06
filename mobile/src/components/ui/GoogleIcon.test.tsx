// GoogleIcon has no web test — there it is an inline <svg> in the Landing
// markup. The port has to keep two things true: the brand paths are Google's
// four-color "G", and the icon is sized through props (react-native-svg has no
// class-driven sizing), defaulting to the web's `h-4 w-4`.
import { render, screen } from "@testing-library/react-native";
import { GoogleIcon } from "@/components/ui/GoogleIcon";

type Node = { type: string; props: Record<string, unknown>; children: unknown[] | null };

function allNodes(root: unknown): Node[] {
  if (!root || typeof root !== "object") return [];
  const node = root as Node;
  return [node, ...(node.children ?? []).flatMap(allNodes)];
}

const paths = () => allNodes(screen.toJSON()).filter((n) => n.type === "RNSVGPath");

describe("GoogleIcon", () => {
  it("defaults to 16pt square — the web's h-4 w-4", async () => {
    await render(<GoogleIcon />);
    const svg = allNodes(screen.toJSON()).find((n) => n.type === "RNSVGSvgView");
    expect(svg?.props.width).toBe(16);
    expect(svg?.props.height).toBe(16);
  });

  it("takes a custom size", async () => {
    await render(<GoogleIcon size={24} />);
    const svg = allNodes(screen.toJSON()).find((n) => n.type === "RNSVGSvgView");
    expect(svg?.props.width).toBe(24);
    expect(svg?.props.height).toBe(24);
  });

  it("keeps the 24-unit viewBox the web's paths are drawn in", async () => {
    await render(<GoogleIcon size={40} />);
    const svg = allNodes(screen.toJSON()).find((n) => n.type === "RNSVGSvgView");
    // Scaling happens through the viewBox, so the paths never need rewriting.
    expect(svg?.props.vbWidth).toBe(24);
    expect(svg?.props.vbHeight).toBe(24);
  });

  it("draws the four brand-colored wedges", async () => {
    await render(<GoogleIcon />);
    expect(paths()).toHaveLength(4);
    for (const p of paths()) {
      expect(typeof p.props.d).toBe("string");
      expect(String(p.props.d).length).toBeGreaterThan(0);
    }
  });

  it("is hidden from the screen reader — the button next to it carries the name", async () => {
    await render(<GoogleIcon />);
    const svg = allNodes(screen.toJSON()).find((n) => n.type === "RNSVGSvgView");
    expect(svg?.props.focusable).toBe(false);
  });
});
