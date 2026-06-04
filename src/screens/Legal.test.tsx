import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Privacy, Terms } from "@/screens/Legal";

describe("Legal pages", () => {
  beforeEach(() => {
    window.location.hash = "/privacy";
  });

  it("renders the privacy page", () => {
    render(<Privacy />);
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(
      screen.getByText(/we never sell your data/i),
    ).toBeInTheDocument();
  });

  it("renders the terms page", () => {
    render(<Terms />);
    expect(screen.getByText("Terms")).toBeInTheDocument();
    expect(screen.getByText(/personal money journal/i)).toBeInTheDocument();
  });

  it("goes back to the landing page from the Back button", async () => {
    render(<Terms />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(window.location.hash).toBe("#/home");
  });
});
