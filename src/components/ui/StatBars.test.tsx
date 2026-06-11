import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Coffee, Fuel } from "lucide-react";
import { StatBars } from "@/components/ui/StatBars";

describe("StatBars", () => {
  it("renders a row per item with label, value and a proportional bar", () => {
    const { container } = render(
      <StatBars
        items={[
          { id: "coffee", label: "Coffee", icon: Coffee, color: "#8B5E3C", value: "$3.50", fraction: 1 },
          { id: "gas", label: "Gas", icon: Fuel, color: "#FF3B30", value: "$1.75", fraction: 0.5 },
        ]}
      />,
    );
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText("$3.50")).toBeInTheDocument();
    expect(screen.getByText("Gas")).toBeInTheDocument();
    expect(screen.getByText("$1.75")).toBeInTheDocument();
    const bars = [...container.querySelectorAll<HTMLElement>("div[style]")].filter(
      (el) => el.style.width !== "",
    );
    expect(bars.map((el) => el.style.width)).toEqual(["100%", "50%"]);
  });

  it("keeps a visible sliver even for a near-zero fraction", () => {
    const { container } = render(
      <StatBars
        items={[
          { id: "tips", label: "Tips", icon: Coffee, color: "#FFCC00", value: "$0.01", fraction: 0.0001 },
        ]}
      />,
    );
    const bar = [...container.querySelectorAll<HTMLElement>("div[style]")].find(
      (el) => el.style.width !== "",
    );
    expect(bar?.style.width).toBe("2%");
  });
});
