import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import type { Transaction } from "@/types/db";

const { getSession, signOut } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession, signOut } },
}));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

import { Settings } from "@/screens/Settings";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1000,
    original_currency: "USD",
    original_amount: 10,
    rate_used: 89500,
    occurred_at: "2026-06-01T00:00:00.000Z",
    note: null,
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeValue = makeStoreValue();
  getSession.mockResolvedValue({ data: { session: { user: { email: "" } } } });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
});

describe("Settings — account & data", () => {
  it("shows the signed-in email", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { email: "me@x.com" } } },
    });
    render(<Settings />);
    expect(await screen.findByText("me@x.com")).toBeInTheDocument();
  });

  it("falls back to an em dash with no email", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<Settings />);
    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  it("navigates home from the back button", async () => {
    render(<Settings />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("signs out", async () => {
    render(<Settings />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(storeValue.signOut).toHaveBeenCalled();
  });

  it("exports the decrypted in-memory rows to a CSV download", async () => {
    storeValue = makeStoreValue({ transactions: [tx()] });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<Settings />);
    await userEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    clickSpy.mockRestore();
  });

  it("disables export while locked", () => {
    storeValue = makeStoreValue({ locked: true });
    render(<Settings />);
    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeDisabled();
  });
});

describe("Settings — encryption", () => {
  it("off state: shows Off + a turn-on form, no strength or confirm", async () => {
    render(<Settings />);
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.queryByText(/Strength/)).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Confirm passphrase"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Turn off/i }),
    ).not.toBeInTheDocument();
    // No eye toggle while entering — the field is plainly visible.
    expect(
      screen.queryByRole("button", { name: /passphrase/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Passphrase")).toHaveAttribute("type", "text");

    await userEvent.type(screen.getByPlaceholderText("Passphrase"), "easy");
    await userEvent.click(
      screen.getByRole("button", { name: "Turn on encryption" }),
    );
    expect(storeValue.enableEncryption).toHaveBeenCalledWith("easy");
  });

  it("surfaces an enable error", async () => {
    storeValue = makeStoreValue({
      enableEncryption: vi.fn(async () => ({ error: "server said no" })),
    });
    render(<Settings />);
    await userEvent.type(screen.getByPlaceholderText("Passphrase"), "whatever");
    await userEvent.click(
      screen.getByRole("button", { name: "Turn on encryption" }),
    );
    expect(await screen.findByText("server said no")).toBeInTheDocument();
  });

  it("on + unlocked: masks the saved passphrase with an eye toggle, and turns off", async () => {
    storeValue = makeStoreValue({ e2eMode: "passphrase", passphrase: "secret" });
    render(<Settings />);
    expect(screen.getByText("On")).toBeInTheDocument();
    // Saved passphrase is present but masked by default; the eye reveals it.
    const field = screen.getByDisplayValue("secret");
    expect(field).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show passphrase" }));
    expect(field).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Hide passphrase" }));
    expect(field).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Turn off encryption" }));
    expect(storeValue.disableEncryption).toHaveBeenCalled();
  });

  it("saves a changed passphrase", async () => {
    storeValue = makeStoreValue({ e2eMode: "passphrase", passphrase: "secret" });
    render(<Settings />);
    const field = screen.getByDisplayValue("secret");
    await userEvent.clear(field);
    await userEvent.type(field, "newpass");
    await userEvent.click(
      screen.getByRole("button", { name: "Save passphrase" }),
    );
    expect(storeValue.enableEncryption).toHaveBeenCalledWith("newpass");
  });

  it("surfaces a turn-off error", async () => {
    storeValue = makeStoreValue({
      e2eMode: "passphrase",
      passphrase: "secret",
      disableEncryption: vi.fn(async () => ({ error: "cannot disable" })),
    });
    render(<Settings />);
    await userEvent.click(screen.getByRole("button", { name: "Turn off encryption" }));
    expect(await screen.findByText("cannot disable")).toBeInTheDocument();
  });

  it("on + locked: unlock form, no turn-off, surfaces a wrong-passphrase error", async () => {
    storeValue = makeStoreValue({
      e2eMode: "passphrase",
      locked: true,
      unlock: vi.fn(async () => ({ error: "Wrong passphrase." })),
    });
    render(<Settings />);
    expect(screen.getByText("On · locked on this device")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Turn off/i }),
    ).not.toBeInTheDocument();
    // No eye toggle while unlocking — the field is plainly visible.
    expect(
      screen.queryByRole("button", { name: /passphrase/i }),
    ).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Passphrase"), "guess");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(storeValue.unlock).toHaveBeenCalledWith("guess");
    expect(await screen.findByText("Wrong passphrase.")).toBeInTheDocument();
  });

  it("unlocks successfully without an error", async () => {
    storeValue = makeStoreValue({ e2eMode: "passphrase", locked: true });
    render(<Settings />);
    await userEvent.type(screen.getByPlaceholderText("Passphrase"), "right");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(storeValue.unlock).toHaveBeenCalledWith("right");
    expect(screen.queryByText(/Wrong passphrase/)).not.toBeInTheDocument();
  });
});
