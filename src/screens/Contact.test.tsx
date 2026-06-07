import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Contact } from "@/screens/Contact";

describe("Contact page", () => {
  beforeEach(() => {
    window.location.hash = "/contact";
  });

  it("shows a mailto link to the support address", () => {
    render(<Contact />);
    const link = screen.getByRole("link", { name: /nizar@taktek\.io/i });
    expect(link).toHaveAttribute("href", "mailto:nizar@taktek.io");
  });

  it("goes back to the landing page from the Back button", async () => {
    render(<Contact />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(window.location.hash).toBe("#/");
  });
});
