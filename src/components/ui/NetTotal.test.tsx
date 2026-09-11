import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetTotal } from "@/components/ui/NetTotal";

describe("NetTotal", () => {
  it("shows the month label and a positive signed total", () => {
    render(<NetTotal currency="USD" cents={8750} label="June 2026" />);
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    const total = screen.getByText("$87.50");
    expect(total).toHaveClass("text-income");
  });

  it("renders negative totals in red with a minus", () => {
    render(<NetTotal currency="USD" cents={-1250} label="June 2026" />);
    const total = screen.getByText("-$12.50");
    expect(total).toHaveClass("text-expense");
  });

  it("renders zero as neutral", () => {
    render(<NetTotal currency="USD" cents={0} label="June 2026" />);
    expect(screen.getByText("$0.00")).toHaveClass("text-label");
  });
});

describe("NetTotal — other home currencies", () => {
  it("formats in the home currency it's given", () => {
    render(<NetTotal cents={8750} label="Balance" currency="EUR" />);
    expect(screen.getByText("€87.50")).toHaveClass("text-income");
  });

  it("obscures the number behind the currency's symbol when masked", () => {
    render(<NetTotal cents={8750} label="Balance" currency="LBP" masked />);
    expect(screen.getByText("LL •••••")).toHaveClass("text-label-muted");
  });
});
