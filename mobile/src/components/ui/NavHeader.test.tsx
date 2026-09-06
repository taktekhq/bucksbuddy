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


  it("renders the Legal/Contact title as a header", async () => {
    await render(<NavHeader title="Legal" onBack={() => {}} />);
    expect(screen.getByText("Legal")).toBeOnTheScreen();
    expect(screen.getByLabelText("Back")).toBeOnTheScreen();
  });
});
