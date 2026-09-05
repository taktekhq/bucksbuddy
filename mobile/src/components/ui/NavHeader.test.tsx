// NavHeader has no web test — on the web each sub-page inlines the same
// <header>. Here it is one component, so this covers the three title looks,
// the chevron tint and the two ways back is wired.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { NavHeader } from "@/components/ui/NavHeader";
import { colors } from "@/lib/theme";

// The default `onBack` is the router's `back`, which pops the native stack.
const mockBack = jest.fn();
jest.mock("@/lib/router", () => ({ back: () => mockBack() }));

type Node = { type: string; props: Record<string, unknown>; children: unknown[] | null };

function allNodes(root: unknown): Node[] {
  if (!root || typeof root !== "object") return [];
  const node = root as Node;
  return [node, ...(node.children ?? []).flatMap(allNodes)];
}

const chevron = () => allNodes(screen.toJSON()).find((n) => n.type === "RNSVGSvgView");

describe("NavHeader", () => {
  it("shows the title", async () => {
    await render(<NavHeader title="Settings" />);
    expect(screen.getByText("Settings")).toBeOnTheScreen();
  });

  it("pops the stack when no handler is given", async () => {
    await render(<NavHeader title="Settings" />);
    fireEvent.press(screen.getByLabelText("Back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("calls a custom back handler instead of popping", async () => {
    const onBack = jest.fn();
    await render(<NavHeader title="Safe" onBack={onBack} />);
    fireEvent.press(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("tints the chevron carrot by default", async () => {
    await render(<NavHeader title="History" />);
    expect(chevron()?.props.stroke).toBe(colors.carrot);
  });

  it("takes a custom tint — the Safe's chevron is gold", async () => {
    await render(<NavHeader title="Safe" tint="#D4AF37" />);
    expect(chevron()?.props.stroke).toBe("#D4AF37");
  });

  it("renders the dark-room title", async () => {
    await render(<NavHeader title="Stats" dark />);
    expect(screen.getByText("Stats")).toBeOnTheScreen();
    expect(screen.getByLabelText("Back")).toBeOnTheScreen();
  });

  it("renders the Legal/Contact title as a section header", async () => {
    await render(<NavHeader title="Legal" section />);
    expect(screen.getByText("Legal")).toBeOnTheScreen();
    expect(screen.getByLabelText("Back")).toBeOnTheScreen();
  });
});
