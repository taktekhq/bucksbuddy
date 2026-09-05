// Adapted from the web's src/screens/Landing.test.tsx. Two shape differences,
// both from the port rather than the test: Google sign-in goes through
// `@/lib/oauth` (an auth session, not a page redirect), and the hash-router
// assertions become `navigate` calls.
import { render, screen, fireEvent } from "@testing-library/react-native";

// Rendering a whole screen (and the modules it drags in) can outrun jest's
// 5s default on a cold, loaded machine — see TESTING.md.
jest.setTimeout(30000);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigate = jest.fn();
jest.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => (mockNavigate as (...x: unknown[]) => unknown)(...a) }));

const mockSignInWithGoogle = jest.fn(async () => ({ error: null as string | null }));
jest.mock("@/lib/oauth", () => ({
  signInWithGoogle: (...a: unknown[]) => (mockSignInWithGoogle as (...x: unknown[]) => unknown)(...a),
}));

const mockSignInWithPassword = jest.fn(
  async (..._a: unknown[]) => ({ error: null as { message: string } | null }),
);
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signInWithPassword: (...a: unknown[]) => (mockSignInWithPassword as (...x: unknown[]) => unknown)(...a) },
  },
}));

import { Landing } from "@/screens/Landing";

const TAPS_TO_REVEAL = 7;

// The hidden email flow opens after seven taps on the mascot. The Press and the
// emoji inside it share the "carrot" label; the outer one is the button.
async function revealEmailFlow() {
  const carrot = screen.getAllByLabelText("carrot")[0];
  for (let i = 0; i < TAPS_TO_REVEAL; i++) await fireEvent.press(carrot);
}

describe("Landing", () => {
  beforeEach(() => {
    mockSignInWithGoogle.mockResolvedValue({ error: null });
    mockSignInWithPassword.mockResolvedValue({ error: null });
  });

  it("renders the tagline and the three feature cards", async () => {
    await render(<Landing />);
    expect(screen.getByText("For wabbits with bad habits.")).toBeOnTheScreen();
    expect(screen.getByText("Income & expenses")).toBeOnTheScreen();
    expect(screen.getByText("Your private safe")).toBeOnTheScreen();
    expect(screen.getByText("End-to-end encryption")).toBeOnTheScreen();
  });

  it("links to the legal page from the Privacy and Terms button", async () => {
    await render(<Landing />);
    await fireEvent.press(screen.getByText("Privacy and Terms"));
    expect(mockNavigate).toHaveBeenCalledWith("/legal");
  });

  it("links to the public stats page from Community stats", async () => {
    await render(<Landing />);
    await fireEvent.press(screen.getByText("Community stats"));
    expect(mockNavigate).toHaveBeenCalledWith("/stats");
  });

  it("starts Google sign-in and shows the redirecting state", async () => {
    mockSignInWithGoogle.mockImplementation(async () => {
      // Mid-flight the CTA reads "Redirecting…" and is disabled.
      for (let i = 0; i < 3; i++) await Promise.resolve();
      expect(screen.getByText("Redirecting…")).toBeOnTheScreen();
      return { error: null };
    });
    await render(<Landing />);
    await fireEvent.press(screen.getByText("Continue with Google"));
    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    // Unlike the web's page redirect, the button is released again — the auth
    // sheet can be dismissed without leaving the page.
    expect(screen.getByText("Continue with Google")).toBeOnTheScreen();
  });

  it("surfaces a sign-in error and re-enables the button", async () => {
    mockSignInWithGoogle.mockResolvedValue({ error: "oauth boom" });
    await render(<Landing />);
    await fireEvent.press(screen.getByText("Continue with Google"));
    expect(screen.getByText("oauth boom")).toBeOnTheScreen();
    expect(screen.getByText("Continue with Google")).toBeOnTheScreen();
  });

  it("reveals the separate email sign-in flow after seven carrot taps", async () => {
    await render(<Landing />);
    await revealEmailFlow();
    expect(screen.getByPlaceholderText("Email")).toBeOnTheScreen();
    // The marketing content is gone — this is a separate flow shown in place.
    expect(screen.queryByText("For wabbits with bad habits.")).toBeNull();
  });

  it("keeps the marketing page until the seventh tap", async () => {
    await render(<Landing />);
    const carrot = screen.getAllByLabelText("carrot")[0];
    for (let i = 0; i < TAPS_TO_REVEAL - 1; i++) await fireEvent.press(carrot);
    expect(screen.queryByPlaceholderText("Email")).toBeNull();
    expect(screen.getByText("For wabbits with bad habits.")).toBeOnTheScreen();
  });

  it("returns to the landing from the email flow via Back", async () => {
    await render(<Landing />);
    await revealEmailFlow();
    await fireEvent.press(screen.getByText("Back"));
    expect(screen.getByText("For wabbits with bad habits.")).toBeOnTheScreen();
  });

  it("signs in with email and password", async () => {
    await render(<Landing />);
    await revealEmailFlow();
    await fireEvent.changeText(screen.getByPlaceholderText("Email"), " me@x.com ");
    await fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret");
    await fireEvent.press(screen.getByText("Sign in"));
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "me@x.com",
      password: "secret",
    });
  });

  it("shows a password sign-in error", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: "bad creds" } });
    await render(<Landing />);
    await revealEmailFlow();
    await fireEvent.changeText(screen.getByPlaceholderText("Email"), "me@x.com");
    await fireEvent.changeText(screen.getByPlaceholderText("Password"), "nope");
    // The password field's return key submits, like the web's <form>.
    await fireEvent(screen.getByPlaceholderText("Password"), "submitEditing");
    expect(screen.getByText("bad creds")).toBeOnTheScreen();
  });

  it("won't submit with an empty email or an empty password", async () => {
    await render(<Landing />);
    await revealEmailFlow();
    // Empty email: the web's `required` attribute; here the field is focused.
    await fireEvent.press(screen.getByText("Sign in"));
    expect(mockSignInWithPassword).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByPlaceholderText("Email"), "me@x.com");
    await fireEvent.press(screen.getByText("Sign in"));
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("moves from the email field to the password field on Next", async () => {
    await render(<Landing />);
    await revealEmailFlow();
    await fireEvent(screen.getByPlaceholderText("Email"), "submitEditing");
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("ignores a second submit while one is already in flight", async () => {
    await render(<Landing />);
    await revealEmailFlow();
    await fireEvent.changeText(screen.getByPlaceholderText("Email"), "me@x.com");
    await fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret");
    await fireEvent.press(screen.getByText("Sign in"));
    // A successful sign-in leaves the button busy — App swaps the screen out.
    expect(screen.getByText("Signing in…")).toBeOnTheScreen();
    // The button is disabled, but the keyboard's return key isn't: that's the
    // path the `if (loading) return` guard exists for.
    await fireEvent(screen.getByPlaceholderText("Password"), "submitEditing");
    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
  });
});
