// Adapted from the web's src/screens/Settings.test.tsx. The account, delete and
// encryption cases carry over one-for-one; the CSV export differs by port —
// the browser's <a download> is a file written to the cache and handed to the
// share sheet — so that one case is rewritten around those calls.
import { render, screen, fireEvent } from "@testing-library/react-native";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import posthog from "@/lib/posthog";
import type { Transaction } from "@/types/db";

// Rendering a whole screen (and the modules it drags in) can outrun jest's
// 5s default on a cold, loaded machine — see TESTING.md.
jest.setTimeout(30000);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockGetSession = jest.fn(async () => ({
  data: { session: { user: { email: "" } } as { user: { email: string } } | null },
}));
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => (mockGetSession as (...x: unknown[]) => unknown)(...a) } },
}));

const mockNavigate = jest.fn();
jest.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => (mockNavigate as (...x: unknown[]) => unknown)(...a) }));

function makeStoreValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    transactions: [] as Transaction[],
    lbpPerUsd: DEFAULT_LBP_PER_USD,
    balanceCents: 0,
    monthlyNetCents: 0,
    addTransaction: jest.fn(async () => ({ error: null })),
    updateTransaction: jest.fn(async () => ({ error: null })),
    deleteTransaction: jest.fn(async () => ({ error: null })),
    setRate: jest.fn(async () => ({ error: null })),
    e2eMode: "default",
    locked: false,
    passphrase: null as string | null,
    unlock: jest.fn(async () => ({ error: null as string | null })),
    enableEncryption: jest.fn(async () => ({ error: null as string | null })),
    disableEncryption: jest.fn(async () => ({ error: null as string | null })),
    signOut: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => ({ error: null as string | null })),
    safeTotalCents: 0,
    safeGoldEntries: [],
    safeGoldGrams: 0,
    addSafeGoldEntry: jest.fn(async () => ({ error: null })),
    deleteSafeGoldEntry: jest.fn(async () => ({ error: null })),
    refresh: jest.fn(async () => {}),
    ...overrides,
  };
}

let mockStoreValue = makeStoreValue();
jest.mock("@/lib/store", () => ({ useStore: () => mockStoreValue }));

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
  mockStoreValue = makeStoreValue();
  mockGetSession.mockResolvedValue({ data: { session: { user: { email: "" } } } });
});

describe("Settings — account & data", () => {
  it("shows the signed-in email", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: "me@x.com" } } },
    });
    await render(<Settings />);
    expect(await screen.findByText("me@x.com")).toBeOnTheScreen();
  });

  it("falls back to an em dash with no email", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await render(<Settings />);
    expect(await screen.findByText("—")).toBeOnTheScreen();
  });

  it("navigates home from the back button", async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("signs out", async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Sign out"));
    expect(mockStoreValue.signOut).toHaveBeenCalled();
  });

  it("exports the decrypted in-memory rows through the share sheet", async () => {
    mockStoreValue = makeStoreValue({ transactions: [tx()] });
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Export CSV"));

    const written = (File as unknown as jest.Mock).mock.results[0].value;
    expect(written.write).toHaveBeenCalledWith(expect.stringContaining("Groceries"));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      written.uri,
      expect.objectContaining({ mimeType: "text/csv" }),
    );
    expect(posthog.capture).toHaveBeenCalledWith("csv_exported", { row_count: 1 });
  });

  it("still records the export when there's no share sheet to hand it to", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Export CSV"));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(posthog.capture).toHaveBeenCalledWith("csv_exported", { row_count: 0 });
  });

  it("stays quiet when the export can't be written", async () => {
    (File as unknown as jest.Mock).mockImplementationOnce(() => ({
      uri: "/cache/nope.csv",
      write: () => {
        throw new Error("storage full");
      },
    }));
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Export CSV"));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalledWith("csv_exported", expect.anything());
  });

  it("disables export while locked", async () => {
    mockStoreValue = makeStoreValue({ locked: true });
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Export CSV"));
    expect(File as unknown as jest.Mock).not.toHaveBeenCalled();
  });
});

describe("Settings — delete account", () => {
  it("confirms before deleting, then calls the store", async () => {
    await render(<Settings />);
    // First tap only reveals the confirmation; nothing is deleted yet.
    await fireEvent.press(screen.getByText("Delete account"));
    expect(mockStoreValue.deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByText(/can't be undone/i)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText("Delete everything"));
    expect(mockStoreValue.deleteAccount).toHaveBeenCalled();
    expect(posthog.capture).toHaveBeenCalledWith("account_deleted");
    // On success the button stays in its busy state (the session is ending).
    expect(screen.getByText("Deleting…")).toBeOnTheScreen();
  });

  it("cancels out of the confirmation", async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Delete account"));
    await fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("Delete everything")).toBeNull();
    expect(screen.getByText("Delete account")).toBeOnTheScreen();
  });

  it("surfaces a delete error and lets you retry", async () => {
    mockStoreValue = makeStoreValue({
      deleteAccount: jest.fn(async () => ({ error: "could not delete" })),
    });
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Delete account"));
    await fireEvent.press(screen.getByText("Delete everything"));
    expect(screen.getByText("could not delete")).toBeOnTheScreen();
    // Not stuck busy — the button is back so they can try again.
    expect(screen.getByText("Delete everything")).toBeOnTheScreen();
  });
});

describe("Settings — encryption", () => {
  it("off state: shows Off + a turn-on form, no eye toggle", async () => {
    await render(<Settings />);
    expect(screen.getByText("Off")).toBeOnTheScreen();
    expect(screen.getByText(/Turn it on so no one else can see your data/)).toBeOnTheScreen();
    expect(screen.queryByText("Turn off encryption")).toBeNull();
    // No eye toggle while entering — the field is plainly visible.
    expect(screen.queryByLabelText("Show passphrase")).toBeNull();
    expect(screen.getByPlaceholderText("Passphrase").props.secureTextEntry).toBe(false);

    await fireEvent.changeText(screen.getByPlaceholderText("Passphrase"), "easy");
    await fireEvent.press(screen.getByText("Turn on encryption"));
    expect(mockStoreValue.enableEncryption).toHaveBeenCalledWith("easy");
    expect(posthog.capture).toHaveBeenCalledWith("encryption_enabled");
  });

  it("shows a saving state while the passphrase is stored", async () => {
    mockStoreValue = makeStoreValue({
      enableEncryption: jest.fn(async () => {
        // Let React paint the busy label before the call settles.
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(screen.getByText("Saving…")).toBeOnTheScreen();
        return { error: null };
      }),
    });
    await render(<Settings />);
    await fireEvent.changeText(screen.getByPlaceholderText("Passphrase"), "hunter2");
    await fireEvent.press(screen.getByText("Turn on encryption"));
    expect(mockStoreValue.enableEncryption).toHaveBeenCalledWith("hunter2");
    expect(screen.getByText("Turn on encryption")).toBeOnTheScreen();
  });

  it("never submits an empty passphrase, and says why", async () => {
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Turn on encryption"));
    expect(mockStoreValue.enableEncryption).not.toHaveBeenCalled();
    // Returning in silence made the button read as broken rather than
    // unavailable — the web's `required` attribute says something.
    expect(screen.getByText("Enter a passphrase.")).toBeOnTheScreen();
  });

  it("surfaces an enable error", async () => {
    mockStoreValue = makeStoreValue({
      enableEncryption: jest.fn(async () => ({ error: "server said no" })),
    });
    await render(<Settings />);
    await fireEvent.changeText(screen.getByPlaceholderText("Passphrase"), "whatever");
    await fireEvent.press(screen.getByText("Turn on encryption"));
    expect(screen.getByText("server said no")).toBeOnTheScreen();
    expect(posthog.capture).not.toHaveBeenCalledWith("encryption_enabled");
  });

  it("on + unlocked: masks the saved passphrase with an eye toggle, and turns off", async () => {
    mockStoreValue = makeStoreValue({ e2eMode: "passphrase", passphrase: "secret" });
    await render(<Settings />);
    expect(screen.getByText("On")).toBeOnTheScreen();
    // Saved passphrase is present but masked by default; the eye reveals it.
    const field = screen.getByDisplayValue("secret");
    expect(field.props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByLabelText("Show passphrase"));
    expect(screen.getByDisplayValue("secret").props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByLabelText("Hide passphrase"));
    expect(screen.getByDisplayValue("secret").props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByText("Turn off encryption"));
    expect(mockStoreValue.disableEncryption).toHaveBeenCalled();
    expect(posthog.capture).toHaveBeenCalledWith("encryption_disabled");
  });

  it("saves a changed passphrase without re-announcing encryption", async () => {
    mockStoreValue = makeStoreValue({ e2eMode: "passphrase", passphrase: "secret" });
    await render(<Settings />);
    await fireEvent.changeText(screen.getByDisplayValue("secret"), "newpass");
    // The keyboard's return key submits, like the web's <form>.
    await fireEvent(screen.getByDisplayValue("newpass"), "submitEditing");
    expect(mockStoreValue.enableEncryption).toHaveBeenCalledWith("newpass");
    expect(posthog.capture).not.toHaveBeenCalledWith("encryption_enabled");
  });

  it("surfaces a turn-off error", async () => {
    mockStoreValue = makeStoreValue({
      e2eMode: "passphrase",
      passphrase: "secret",
      disableEncryption: jest.fn(async () => ({ error: "cannot disable" })),
    });
    await render(<Settings />);
    await fireEvent.press(screen.getByText("Turn off encryption"));
    expect(screen.getByText("cannot disable")).toBeOnTheScreen();
    expect(posthog.capture).not.toHaveBeenCalledWith("encryption_disabled");
  });

  it("on + locked: unlock form, no turn-off, surfaces a wrong-passphrase error", async () => {
    mockStoreValue = makeStoreValue({
      e2eMode: "passphrase",
      locked: true,
      unlock: jest.fn(async () => ({ error: "Wrong passphrase." })),
    });
    await render(<Settings />);
    expect(screen.getByText("On · locked on this device")).toBeOnTheScreen();
    expect(screen.queryByText("Turn off encryption")).toBeNull();
    // No eye toggle while unlocking — the field is plainly visible.
    expect(screen.queryByLabelText("Show passphrase")).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText("Passphrase"), "guess");
    await fireEvent.press(screen.getByText("Unlock"));
    expect(mockStoreValue.unlock).toHaveBeenCalledWith("guess");
    expect(screen.getByText("Wrong passphrase.")).toBeOnTheScreen();
  });

  it("unlocks successfully without an error", async () => {
    mockStoreValue = makeStoreValue({ e2eMode: "passphrase", locked: true });
    await render(<Settings />);
    await fireEvent.changeText(screen.getByPlaceholderText("Passphrase"), "right");
    await fireEvent.press(screen.getByText("Unlock"));
    expect(mockStoreValue.unlock).toHaveBeenCalledWith("right");
    expect(screen.queryByText(/Wrong passphrase/)).toBeNull();
    expect(posthog.capture).not.toHaveBeenCalledWith("encryption_enabled");
  });
});
