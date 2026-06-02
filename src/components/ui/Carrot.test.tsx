import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Carrot } from "@/components/ui/Carrot";

describe("Carrot", () => {
  it("renders the carrot emoji with the default size class", () => {
    render(<Carrot />);
    const el = screen.getByRole("img", { name: "carrot" });
    expect(el).toHaveTextContent("🥕");
    expect(el).toHaveClass("text-5xl");
  });

  it("applies a custom size class", () => {
    render(<Carrot className="text-6xl" />);
    expect(screen.getByRole("img", { name: "carrot" })).toHaveClass("text-6xl");
  });
});
