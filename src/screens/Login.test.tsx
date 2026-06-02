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

import { Login } from "@/screens/Login";

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOAuth.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });
  });

  it("renders the wordmark and Google button", () => {
    render(<Login />);
    expect(screen.getByText("What's up, Doc?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue with Google/ }),
    ).toBeInTheDocument();
  });

  it("starts Google OAuth and shows the redirecting state", async () => {
    render(<Login />);
    await userEvent.click(
      screen.getByRole("button", { name: /Continue with Google/ }),
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    // On success the browser would navigate away; the button stays disabled.
    expect(screen.getByRole("button", { name: "Redirecting…" })).toBeDisabled();
  });

  it("surfaces an OAuth error and re-enables the button", async () => {
    signInWithOAuth.mockResolvedValue({ error: { message: "oauth boom" } });
    render(<Login />);
    await userEvent.click(
      screen.getByRole("button", { name: /Continue with Google/ }),
    );
    expect(await screen.findByText("oauth boom")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue with Google/ }),
    ).toBeEnabled();
  });

  it("reveals the hidden password form after seven carrot taps", async () => {
    render(<Login />);
    const carrot = screen.getByRole("button", { name: "carrot" });
    for (let i = 0; i < 7; i++) await userEvent.click(carrot);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    // Tapping again once revealed is a no-op (no crash, form stays).
    await userEvent.click(carrot);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });

  it("signs in with email and password", async () => {
    render(<Login />);
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
    render(<Login />);
    const carrot = screen.getByRole("button", { name: "carrot" });
    for (let i = 0; i < 7; i++) await userEvent.click(carrot);
    await userEvent.type(screen.getByPlaceholderText("Email"), "me@x.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("bad creds")).toBeInTheDocument();
  });
});
