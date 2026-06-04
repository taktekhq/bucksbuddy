import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Legal } from "@/screens/Legal";

describe("Legal page", () => {
  beforeEach(() => {
    window.location.hash = "/legal";
  });

  it("renders both the privacy and terms sections", () => {
    render(<Legal />);
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Terms")).toBeInTheDocument();
    expect(screen.getByText(/we don.t sell your data/i)).toBeInTheDocument();
    expect(screen.getByText(/personal money journal/i)).toBeInTheDocument();
  });

  it("discloses which Google account fields are used", () => {
    render(<Legal />);
    expect(
      screen.getByText(/name, email, and ID \(OpenID\) from Google/i),
    ).toBeInTheDocument();
  });

  it("goes back to the landing page from the Back button", async () => {
    render(<Legal />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(window.location.hash).toBe("#/");
  });
});
