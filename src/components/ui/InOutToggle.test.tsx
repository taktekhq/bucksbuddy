import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InOutToggle } from "@/components/ui/InOutToggle";

describe("InOutToggle", () => {
  it("highlights the active side (Out by default)", () => {
    render(<InOutToggle isIncome={false} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Out" })).toHaveClass("bg-expense");
  });

  it("highlights In when isIncome is true", () => {
    render(<InOutToggle isIncome={true} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "In" })).toHaveClass("bg-income");
  });

  it("reports direction changes", async () => {
    const onChange = vi.fn();
    render(<InOutToggle isIncome={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "In" }));
    expect(onChange).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole("button", { name: "Out" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
