import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signInWithOAuth, signInWithPassword } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ error: null as { message: string } | null })),
  signInWithPassword: vi.fn(async () => ({ error: null as { message: string } | null })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithOAuth, signInWithPassword } },
}));

import { Landing } from "@/screens/Landing";

describe("Landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOAuth.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });
  });

  it("renders the tagline and the three feature cards", () => {
    render(<Landing />);
    expect(screen.getByText("Track wabbits and bad habits.")).toBeInTheDocument();
    expect(screen.getByText("Income & expenses")).toBeInTheDocument();
    expect(screen.getByText("Your private safe")).toBeInTheDocument();
    expect(screen.getByText("End-to-end encrypted")).toBeInTheDocument();
  });

  it("starts Google OAuth and shows the redirecting state", async () => {
    render(<Landing />);
    await userEvent.click(
      screen.getByRole("button", { name: /Continue with Google/ }),
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    expect(screen.getByRole("button", { name: "Redirecting…" })).toBeDisabled();
  });

  it("surfaces an OAuth error and re-enables the button", async () => {
    signInWithOAuth.mockResolvedValue({ error: { message: "oauth boom" } });
    render(<Landing />);
    await userEvent.click(
      screen.getByRole("button", { name: /Continue with Google/ }),
    );
    expect(await screen.findByText("oauth boom")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue with Google/ }),
    ).toBeEnabled();
  });

  it("reveals the separate email sign-in flow after seven carrot taps", async () => {
    render(<Landing />);
    const carrot = screen.getByRole("button", { name: "carrot" });
    for (let i = 0; i < 7; i++) await userEvent.click(carrot);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    // The marketing content is gone — this is a separate flow shown in place.
    expect(
      screen.queryByText("Track wabbits and bad habits."),
    ).not.toBeInTheDocument();
  });

  it("returns to the landing from the email flow via Back", async () => {
    render(<Landing />);
    const carrot = screen.getByRole("button", { name: "carrot" });
    for (let i = 0; i < 7; i++) await userEvent.click(carrot);
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("Track wabbits and bad habits.")).toBeInTheDocument();
  });

  it("signs in with email and password", async () => {
    render(<Landing />);
    const carrot = screen.getByRole("button", { name: "carrot" });
    for (let i = 0; i < 7; i++) await userEvent.click(carrot);

    await userEvent.type(screen.getByPlaceholderText("Email"), " me@x.com ");
    await userEvent.type(screen.getByPlaceholderText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "me@x.com",
      password: "secret",
    });
  });

  it("shows a password sign-in error", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "bad creds" } });
    render(<Landing />);
    const carrot = screen.getByRole("button", { name: "carrot" });
    for (let i = 0; i < 7; i++) await userEvent.click(carrot);
    await userEvent.type(screen.getByPlaceholderText("Email"), "me@x.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("bad creds")).toBeInTheDocument();
  });
});
