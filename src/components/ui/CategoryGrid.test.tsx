import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";

describe("CategoryGrid", () => {
  it("renders a tile per category and reports selection", async () => {
    const onSelect = vi.fn();
    render(
      <CategoryGrid
        categories={EXPENSE_CATEGORIES}
        selected={null}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Groceries/ }));
    expect(onSelect).toHaveBeenCalledWith("groceries");
  });

  it("fills the selected tile with the category color", () => {
    render(
      <CategoryGrid
        categories={EXPENSE_CATEGORIES}
        selected="gas"
        onSelect={() => {}}
      />,
    );
    const gas = screen.getByRole("button", { name: /Gas/ });
    expect(gas).toHaveStyle({ backgroundColor: "#FF3B30" });
  });

  it("works with the income list too", () => {
    render(
      <CategoryGrid
        categories={INCOME_CATEGORIES}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Salary/ })).toBeInTheDocument();
  });
});
