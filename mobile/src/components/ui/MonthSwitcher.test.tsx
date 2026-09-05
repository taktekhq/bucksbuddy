// MonthSwitcher has no web test — on the web the two chevrons are inlined in
// the Stats and History pages. What matters is the paging contract: each side
// reports its direction, and a side that has nowhere to go is inert.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { colors } from "@/lib/theme";

type Node = { type: string; props: Record<string, unknown>; children: unknown[] | null };

function allNodes(root: unknown): Node[] {
  if (!root || typeof root !== "object") return [];
  const node = root as Node;
  return [node, ...(node.children ?? []).flatMap(allNodes)];
}

describe("MonthSwitcher", () => {
  const props = {
    label: "June 2026",
    onPrev: jest.fn(),
    onNext: jest.fn(),
    canPrev: true,
    canNext: true,
  };

  it("shows the month it is on", async () => {
    await render(<MonthSwitcher {...props} />);
    expect(screen.getByText("June 2026")).toBeOnTheScreen();
  });

  it("labels both chevrons for the screen reader", async () => {
    await render(<MonthSwitcher {...props} />);
    expect(screen.getByLabelText("Previous month")).toBeOnTheScreen();
    expect(screen.getByLabelText("Next month")).toBeOnTheScreen();
  });

  it("walks back a month", async () => {
    const onPrev = jest.fn();
    await render(<MonthSwitcher {...props} onPrev={onPrev} />);
    fireEvent.press(screen.getByLabelText("Previous month"));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("walks forward a month", async () => {
    const onNext = jest.fn();
    await render(<MonthSwitcher {...props} onNext={onNext} />);
    fireEvent.press(screen.getByLabelText("Next month"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("stops at the oldest month there is data for", async () => {
    const onPrev = jest.fn();
    await render(<MonthSwitcher {...props} onPrev={onPrev} canPrev={false} />);
    const prev = screen.getByLabelText("Previous month");
    fireEvent.press(prev);
    expect(onPrev).not.toHaveBeenCalled();
    expect(prev.props.accessibilityState).toEqual({ disabled: true });
  });

  it("stops at the present", async () => {
    const onNext = jest.fn();
    await render(<MonthSwitcher {...props} onNext={onNext} canNext={false} />);
    const next = screen.getByLabelText("Next month");
    fireEvent.press(next);
    expect(onNext).not.toHaveBeenCalled();
    expect(next.props.accessibilityState).toEqual({ disabled: true });
  });

  it("draws both chevrons in carrot — the color the web took from text-carrot", async () => {
    await render(<MonthSwitcher {...props} />);
    const svgs = allNodes(screen.toJSON()).filter((n) => n.type === "RNSVGSvgView");
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) expect(svg.props.stroke).toBe(colors.carrot);
  });
});
