import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Landing } from "@/screens/Landing";

describe("Landing", () => {
  beforeEach(() => {
    window.location.hash = "/home";
  });

  it("renders the wordmark, pitch, and feature cards", () => {
    render(<Landing />);
    expect(
      screen.getByText("The friendly way to watch your money."),
    ).toBeInTheDocument();
    expect(screen.getByText("Money in, green")).toBeInTheDocument();
    expect(screen.getByText("Money out, red")).toBeInTheDocument();
    expect(screen.getByText("Stash it in the safe")).toBeInTheDocument();
  });

  it("redirects the CTA to the Login screen (route '/')", async () => {
    render(<Landing />);
    await userEvent.click(
      screen.getByRole("button", { name: /Continue with Google/ }),
    );
    expect(window.location.hash).toBe("#/");
  });

  it("redirects the Log in link to the Login screen (route '/')", async () => {
    render(<Landing />);
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(window.location.hash).toBe("#/");
  });
});
