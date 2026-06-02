import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "@/components/ui/SectionHeader";

describe("SectionHeader", () => {
  it("renders its children as a heading", () => {
    render(<SectionHeader>History</SectionHeader>);
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
  });

  it("merges a custom className", () => {
    render(<SectionHeader className="mt-4">Account</SectionHeader>);
    expect(screen.getByRole("heading", { name: "Account" })).toHaveClass("mt-4");
  });
});
