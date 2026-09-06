// Adapted from the web's src/screens/Reset.test.tsx — the same five cases,
// with `render`/`fireEvent` awaited (RNTL 14) and typing done with
// `changeText` rather than userEvent.type.
import { render, screen, fireEvent } from "@testing-library/react-native";

// Rendering a whole screen (and the modules it drags in) can outrun jest's
// 5s default on a cold, loaded machine — see TESTING.md.
jest.setTimeout(30000);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUpdateUser = jest.fn(
  async (..._a: unknown[]) => ({ error: null as { message: string } | null }),
);
const mockSignOut = jest.fn(async (..._a: unknown[]) => ({ error: null }));
// The factory is hoisted above the `const`s, so it must reference them lazily
// (calling through, not capturing) — jest's equivalent of the web's vi.hoisted.
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      updateUser: (...a: unknown[]) => (mockUpdateUser as (...x: unknown[]) => unknown)(...a),
      signOut: (...a: unknown[]) => (mockSignOut as (...x: unknown[]) => unknown)(...a),
    },
  },
}));

import { Reset } from "@/screens/Reset";

async function fill(password: string, confirm: string) {
  await fireEvent.changeText(screen.getByPlaceholderText("New password"), password);
  await fireEvent.changeText(screen.getByPlaceholderText("Confirm password"), confirm);
}

describe("Reset", () => {
  beforeEach(() => {
    mockUpdateUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("rejects passwords shorter than 8 characters without calling updateUser", async () => {
    await render(<Reset />);
    await fill("short", "short");
    await fireEvent.press(screen.getByText("Update password"));
    expect(screen.getByText(/at least 8 characters/i)).toBeOnTheScreen();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords without calling updateUser", async () => {
    await render(<Reset />);
    await fill("abcd1234", "abcd9999");
    await fireEvent.press(screen.getByText("Update password"));
    expect(screen.getByText(/don't match/i)).toBeOnTheScreen();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("updates the password and signs the user out on success", async () => {
    await render(<Reset />);
    await fill("abcd1234", "abcd1234");
    // The confirm field's return key submits, like the web's <form>.
    await fireEvent(screen.getByPlaceholderText("Confirm password"), "submitEditing");

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "abcd1234" });
    expect(await screen.findByText("All set")).toBeOnTheScreen();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("surfaces the Supabase error and keeps the form usable", async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: "token expired" } });
    await render(<Reset />);
    await fill("abcd1234", "abcd1234");
    await fireEvent.press(screen.getByText("Update password"));
    expect(await screen.findByText("token expired")).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
    // Not stuck busy — the CTA is back to its idle label.
    expect(screen.getByText("Update password")).toBeOnTheScreen();
  });

  it("ignores a second submit while one is already in flight", async () => {
    // The web relies on the <form>'s disabled submit button; the port added an
    // explicit `if (busy) return` guard, so tap again mid-flight and prove the
    // second submit is a no-op. (Pressing from inside the pending call is the
    // only place the component is observably busy.)
    mockUpdateUser.mockImplementation(async () => {
      // Let React paint the busy state before tapping again.
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(screen.getByText("Saving…")).toBeOnTheScreen();
      // The CTA is disabled while busy, but the keyboard's return key isn't —
      // that's the path the `if (busy) return` guard exists for. Called
      // directly rather than through fireEvent: we're already inside the outer
      // act() and nesting one would let the tail of this save escape it.
      await screen.getByPlaceholderText("Confirm password").props.onSubmitEditing();
      return { error: null };
    });
    await render(<Reset />);
    await fill("abcd1234", "abcd1234");
    await fireEvent.press(screen.getByText("Update password"));
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(screen.getByText("All set")).toBeOnTheScreen();
  });

  it("moves from the password field to the confirm field on Next", async () => {
    await render(<Reset />);
    await fireEvent(screen.getByPlaceholderText("New password"), "submitEditing");
    // Nothing is submitted by the first field's return key — it only moves on.
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("Cancel signs out so the recovery session doesn't linger", async () => {
    await render(<Reset />);
    await fireEvent.press(screen.getByText("Cancel"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
