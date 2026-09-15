import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import posthog from "@/lib/posthog";
import type { SafeGoldEntry, Transaction } from "@/types/db";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession } } }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/router", () => ({ navigate }));

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

// Only the network call is faked — the validation, the snapshot and the masking
// rules are the real ones from lib/feedback.
const submitFeedback = vi.hoisted(() =>
  vi.fn(async () => ({ error: null as string | null })),
);
vi.mock("@/lib/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feedback")>()),
  submitFeedback,
}));

import { Feedback } from "@/screens/Feedback";

function image(name = "shot.png", type = "image/png", size = 1000): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1250,
    original_currency: "USD",
    original_amount: 12.5,
    rate_used: 1,
    occurred_at: "2026-09-01T10:00:00.000Z",
    note: null,
    created_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

function gold(overrides: Partial<SafeGoldEntry> = {}): SafeGoldEntry {
  return {
    id: "g1",
    user_id: "u1",
    is_deposit: true,
    grams: 5,
    note: null,
    occurred_at: "2026-09-01T10:00:00.000Z",
    created_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Render and wait for the session lookup to land. */
async function open() {
  render(<Feedback />);
  await screen.findByRole("button", { name: "Send feedback" });
}

const write = async (text: string) =>
  userEvent.type(screen.getByLabelText("Your feedback"), text);

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  storeValue = makeStoreValue();
  submitFeedback.mockResolvedValue({ error: null });
  getSession.mockResolvedValue({
    data: { session: { user: { id: "u1", email: "me@x.com" } } },
  });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
});

describe("Feedback — the form", () => {
  it("won't send an empty report", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
    await write("   ");
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
    await write("the keypad eats zeros");
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeEnabled();
  });

  it("names the account the reply goes to", async () => {
    await open();
    expect(screen.getByText(/Sent as me@x\.com/)).toBeInTheDocument();
  });

  it("falls back when the account has no email on it", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    await open();
    expect(screen.getByText(/Sent as your account/)).toBeInTheDocument();
  });

  it("sends the message and shows the thank-you", async () => {
    const capture = vi.spyOn(posthog, "capture");
    await open();
    await write("the keypad eats zeros");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(submitFeedback).toHaveBeenCalledWith({
      userId: "u1",
      message: "the keypad eats zeros",
      screenshots: [],
      data: null,
    });
    expect(capture).toHaveBeenCalledWith("feedback_sent", {
      screenshots: 0,
      shared_data: false,
    });
    expect(await screen.findByText("That's filed.")).toBeInTheDocument();
  });

  it("surfaces a failure and leaves what was typed alone", async () => {
    submitFeedback.mockResolvedValue({ error: "Couldn't send that." });
    await open();
    await write("nope");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByText("Couldn't send that.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your feedback")).toHaveValue("nope");
  });

  it("does nothing without a signed-in account", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<Feedback />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    await write("hello");
    // The button is disabled, so reach the guard the way a stray submit would.
    fireEvent.submit(screen.getByLabelText("Your feedback").closest("form")!);
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("goes back home from the header", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });
});

describe("Feedback — screenshots", () => {
  it("attaches picks from the photo library and can drop one again", async () => {
    await open();
    const input = screen.getByLabelText("Add from your photos");
    await userEvent.upload(input, [image("a.png"), image("b.png")]);

    expect(screen.getByAltText("a.png")).toHaveAttribute("src", "blob:fake");
    expect(screen.getByAltText("b.png")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove a.png" }));
    expect(screen.queryByAltText("a.png")).not.toBeInTheDocument();
    expect(screen.getByAltText("b.png")).toBeInTheDocument();

    await write("here you go");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ screenshots: [expect.objectContaining({ name: "b.png" })] }),
    );
  });

  it("says why a pick was ignored", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Add from your photos"), {
      target: { files: [image("notes.pdf", "application/pdf")] },
    });
    expect(
      screen.getByText("Only PNG, JPEG, WebP, GIF or HEIC images can be attached."),
    ).toBeInTheDocument();
    expect(screen.queryByAltText("notes.pdf")).not.toBeInTheDocument();
  });

  it("copes with a picker that hands back nothing", async () => {
    await open();
    const input = screen.getByLabelText("Add from your photos");
    fireEvent.change(input, { target: { files: null } });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("hides the picker once the cap is reached", async () => {
    await open();
    await userEvent.upload(screen.getByLabelText("Add from your photos"), [
      image("a.png"),
      image("b.png"),
      image("c.png"),
      image("d.png"),
    ]);
    expect(screen.queryByLabelText("Add from your photos")).not.toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });
});

describe("Feedback — including account data", () => {
  it("is off to start with, and says what it would send", async () => {
    storeValue = makeStoreValue({ transactions: [tx(), tx({ id: "t2" })] });
    await open();
    const toggle = screen.getByRole("switch", { name: "Include my data" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Only your message and screenshots are sent/)).toBeInTheDocument();
    expect(screen.getByText("2 entries · 0 gold entries")).toBeInTheDocument();
  });

  it("counts a lone entry in the singular", async () => {
    storeValue = makeStoreValue({ transactions: [tx()], safeGoldEntries: [gold()] });
    await open();
    expect(screen.getByText("1 entry · 1 gold entry")).toBeInTheDocument();
  });

  it("warns what turning it on means, and sends the dump", async () => {
    storeValue = makeStoreValue({
      transactions: [tx()],
      safeGoldEntries: [gold()],
      homeCurrency: "EUR",
      e2eMode: "passphrase",
    });
    const capture = vi.spyOn(posthog, "capture");
    await open();
    await userEvent.click(screen.getByRole("switch", { name: "Include my data" }));

    expect(
      screen.getByText(/deleted once the bug is fixed/),
    ).toBeInTheDocument();
    expect(screen.getByText(/every entry, amount and note, in the clear/)).toBeInTheDocument();

    await write("my totals are wrong");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          account: { user_id: "u1", email: "me@x.com" },
          settings: expect.objectContaining({
            home_currency: "EUR",
            encryption: "passphrase",
          }),
          transactions: [tx()],
          gold_entries: [gold()],
        }),
      }),
    );
    expect(capture).toHaveBeenCalledWith("feedback_sent", {
      screenshots: 0,
      shared_data: true,
    });
  });

  it("can be turned back off again", async () => {
    await open();
    const toggle = screen.getByRole("switch", { name: "Include my data" });
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Only your message and screenshots are sent/)).toBeInTheDocument();
  });

  it("is unavailable while the device is locked", async () => {
    storeValue = makeStoreValue({ locked: true });
    await open();
    expect(screen.getByRole("switch", { name: "Include my data" })).toBeDisabled();
    expect(screen.getByText(/This device is locked/)).toBeInTheDocument();
  });

  it("is unavailable while masked rows are still in memory", async () => {
    storeValue = makeStoreValue({ transactions: [tx({ amountMask: "a8F2" })] });
    await open();
    expect(screen.getByRole("switch", { name: "Include my data" })).toBeDisabled();
    expect(screen.getByText(/This device is locked/)).toBeInTheDocument();
  });
});

describe("Feedback — after sending", () => {
  async function send() {
    await open();
    await write("the keypad eats zeros");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText("That's filed.");
  }

  it("offers the way back to the app", async () => {
    await send();
    await userEvent.click(screen.getByRole("button", { name: "Back to the money" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("hands back an empty form for the next one", async () => {
    await send();
    await userEvent.click(screen.getByRole("button", { name: "Send another" }));
    expect(screen.getByLabelText("Your feedback")).toHaveValue("");
    expect(screen.getByRole("switch", { name: "Include my data" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
  });
});
