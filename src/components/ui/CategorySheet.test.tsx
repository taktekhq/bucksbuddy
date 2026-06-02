import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

import { CategorySheet } from "@/components/ui/CategorySheet";
import { getDraggableNode, panY } from "@/test/motion";

function setup(props: Partial<React.ComponentProps<typeof CategorySheet>> = {}) {
  const onChangeDirection = vi.fn();
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <CategorySheet
      open
      isIncome={false}
      selected={null}
      onChangeDirection={onChangeDirection}
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...utils, onChangeDirection, onSelect, onClose };
}

describe("CategorySheet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when closed", () => {
    const { container } = render(
      <CategorySheet
        open={false}
        isIncome={false}
        selected={null}
        onChangeDirection={() => {}}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the grid and direction toggle when open", () => {
    setup();
    expect(screen.getByRole("button", { name: /Groceries/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Out" })).toBeInTheDocument();
  });

  it("selects a category with no subcategories directly", async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Gas/ }));
    expect(onSelect).toHaveBeenCalledWith("gas");
  });

  it("drills into subcategories and can pick the parent or a sub", async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Health/ }));
    // Now on the subcategory step.
    await userEvent.click(screen.getByRole("button", { name: "Just Health" }));
    expect(onSelect).toHaveBeenLastCalledWith("health");

    await userEvent.click(screen.getByRole("button", { name: "Pharmacy" }));
    expect(onSelect).toHaveBeenLastCalledWith("health/pharmacy");
  });

  it("can go back from the subcategory step to the grid", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Health/ }));
    await userEvent.click(screen.getByRole("button", { name: "Back to categories" }));
    expect(screen.getByRole("button", { name: "Out" })).toBeInTheDocument();
  });

  it("marks the active parent and subcategory chips", async () => {
    setup({ selected: "health/pharmacy" });
    await userEvent.click(screen.getByRole("button", { name: /Health/ }));
    const pharmacy = screen.getByRole("button", { name: "Pharmacy" });
    expect(pharmacy).toHaveStyle({ color: "#FFFFFF" });
  });

  it("marks the bare-parent chip active when no sub is chosen", async () => {
    setup({ selected: "health" });
    // selected base is highlighted in the grid; drill in to see the "Just" chip.
    await userEvent.click(screen.getByRole("button", { name: /Health/ }));
    expect(screen.getByRole("button", { name: "Just Health" })).toHaveStyle({
      color: "#FFFFFF",
    });
  });

  it("relays the direction toggle", async () => {
    const { onChangeDirection } = setup();
    await userEvent.click(screen.getByRole("button", { name: "In" }));
    expect(onChangeDirection).toHaveBeenCalledWith(true);
  });

  it("closes when the backdrop is clicked", () => {
    const { onClose, container } = setup();
    // The backdrop is the first fixed-inset overlay.
    const overlay = container.querySelector(".bg-black\\/30") as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on a downward drag past the threshold or with high velocity", () => {
    const { onClose, container } = setup();
    const node = getDraggableNode(container);
    act(() => node.__motion.onDragEnd?.({}, panY(200)));
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => node.__motion.onDragEnd?.({}, panY(0, 800)));
    expect(onClose).toHaveBeenCalledTimes(2);
    act(() => node.__motion.onDragEnd?.({}, panY(10, 10))); // not enough → no close
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
