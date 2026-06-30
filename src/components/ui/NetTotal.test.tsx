import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetTotal } from "@/components/ui/NetTotal";

describe("NetTotal", () => {
  it("shows the month label and a positive signed total", () => {
    render(<NetTotal cents={8750} label="June 2026" />);
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    const total = screen.getByText("$87.50");
    expect(total).toHaveClass("text-income");
  });

  it("renders negative totals in red with a minus", () => {
    render(<NetTotal cents={-1250} label="June 2026" />);
    const total = screen.getByText("-$12.50");
    expect(total).toHaveClass("text-expense");
  });

  it("renders zero as neutral", () => {
    render(<NetTotal cents={0} label="June 2026" />);
    expect(screen.getByText("$0.00")).toHaveClass("text-label");
  });
});
