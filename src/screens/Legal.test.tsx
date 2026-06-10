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

  it("thoroughly discloses Google user data access, use, and Limited Use", () => {
    render(<Legal />);
    // The data accessed and how it's used must both be spelled out for Google's
    // API verification.
    expect(screen.getByText(/Google user data we access/i)).toBeInTheDocument();
    expect(
      screen.getByText(/How we use Google user data/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/we do not request access/i)).toBeInTheDocument();
    // The Limited Use commitment must be present, linking the Google policy.
    expect(
      screen.getByText(/Limited Use requirements/i),
    ).toBeInTheDocument();
    const policyLink = screen.getByRole("link", {
      name: /Google API Services User Data Policy/i,
    });
    expect(policyLink).toHaveAttribute(
      "href",
      "https://developers.google.com/terms/api-services-user-data-policy",
    );
  });

  it("goes back to the landing page from the Back button", async () => {
    render(<Legal />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(window.location.hash).toBe("#/");
  });
});
