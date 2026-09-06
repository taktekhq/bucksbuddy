// Adapted from the web's src/components/ui/CategoryGrid.test.tsx. The web's
// tiles are a CSS grid; React Native has none, so the row wraps and each tile
// is given an explicit measured width — which is the one extra thing tested
// here, on top of the web's own assertions.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";

type Node = { type: string; props: Record<string, unknown>; children: unknown[] | null };

function allNodes(root: unknown): Node[] {
  if (!root || typeof root !== "object") return [];
  const node = root as Node;
  return [node, ...(node.children ?? []).flatMap(allNodes)];
}

/** The tile Press behind a category label. */
function tile(label: string): Node {
  const found = allNodes(screen.toJSON()).find(
    (n) =>
      typeof (n.props.style as { backgroundColor?: unknown } | undefined)?.backgroundColor ===
        "string" && JSON.stringify(n).includes(`"${label}"`),
  );
  if (!found) throw new Error(`no tile for ${label}`);
  return found;
}

const bg = (node: Node) => (node.props.style as { backgroundColor?: string }).backgroundColor;
const width = (node: Node) => (node.props.style as { width?: number }).width;

/** Lay the row out, the way the platform would after the first measure pass. */
async function layout(px: number) {
  // `onLayout` sits on the wrapping row; walk up to whoever owns it.
  let node: { props?: Record<string, unknown>; parent?: unknown } | null =
    screen.getByText("Groceries");
  while (node && !node.props?.onLayout) node = (node.parent ?? null) as typeof node;
  await act(async () => {
    fireEvent(node as never, "layout", { nativeEvent: { layout: { width: px } } });
  });
}

describe("CategoryGrid", () => {
  it("renders a tile per category and reports selection", async () => {
    const onSelect = jest.fn();
    await render(
      <CategoryGrid categories={EXPENSE_CATEGORIES} selected={null} onSelect={onSelect} />,
    );
    for (const c of EXPENSE_CATEGORIES) expect(screen.getByText(c.label)).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Groceries"));
    expect(onSelect).toHaveBeenCalledWith("groceries");
  });

  it("fills the selected tile with the category color", async () => {
    await render(
      <CategoryGrid categories={EXPENSE_CATEGORIES} selected="gas" onSelect={() => {}} />,
    );
    expect(bg(tile("Gas"))).toBe("#FF3B30");
  });

  it("sits the unselected tiles on a soft tint of their own color", async () => {
    await render(
      <CategoryGrid categories={EXPENSE_CATEGORIES} selected="gas" onSelect={() => {}} />,
    );
    // `${color}1A` — the same 10% tint the web writes.
    expect(bg(tile("Groceries"))).toBe("#34C7591A");
  });

  it("works with the income list too", async () => {
    await render(
      <CategoryGrid categories={INCOME_CATEGORIES} selected={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("Salary")).toBeOnTheScreen();
  });

  it("splits the measured row into three columns with two 10pt gaps", async () => {
    await render(
      <CategoryGrid categories={EXPENSE_CATEGORIES} selected={null} onSelect={() => {}} />,
    );
    // Before the first layout pass there is nothing to measure against.
    expect(width(tile("Groceries"))).toBe(0);
    await layout(320);
    // (320 - 2 * 10) / 3
    expect(width(tile("Groceries"))).toBe(100);
    expect(width(tile("Gas"))).toBe(100);
  });

  it("marks the tiles that open into subcategories with a dot", async () => {
    await render(
      <CategoryGrid categories={EXPENSE_CATEGORIES} selected={null} onSelect={() => {}} />,
    );
    const dots = allNodes(screen.toJSON()).filter(
      (n) => (n.props.style as { opacity?: number } | undefined)?.opacity === 0.7,
    );
    const withSubs = EXPENSE_CATEGORIES.filter((c) => (c.subcategories?.length ?? 0) > 0);
    expect(withSubs.length).toBeGreaterThan(0);
    expect(withSubs.length).toBeLessThan(EXPENSE_CATEGORIES.length);
    expect(dots).toHaveLength(withSubs.length);
  });

  it("draws the selected tile's dot in white so it reads on the fill", async () => {
    await render(
      <CategoryGrid categories={EXPENSE_CATEGORIES} selected="groceries" onSelect={() => {}} />,
    );
    const dots = allNodes(screen.toJSON())
      .map((n) => n.props.style as { opacity?: number; backgroundColor?: string } | undefined)
      .filter((s) => s?.opacity === 0.7);
    expect(dots).toContainEqual({ backgroundColor: "#FFFFFF", opacity: 0.7 });
    expect(dots).toContainEqual({ backgroundColor: "#FF9500", opacity: 0.7 }); // Food, unselected
  });

  it("renders an empty grid for an empty list", async () => {
    await render(<CategoryGrid categories={[]} selected={null} onSelect={() => {}} />);
    expect(screen.queryByText("Groceries")).toBeNull();
  });
});
