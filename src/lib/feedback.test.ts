import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SafeGoldEntry, Transaction } from "@/types/db";

type UploadResult = { error: { message: string } | null };
type InvokeResult = { data: unknown; error: unknown };

const { upload, remove, from, invoke } = vi.hoisted(() => {
  const upload = vi.fn(
    async (..._args: unknown[]): Promise<{ error: { message: string } | null }> => ({
      error: null,
    }),
  );
  const remove = vi.fn(async (..._args: unknown[]) => ({ error: null }));
  return {
    upload,
    remove,
    from: vi.fn((..._args: unknown[]) => ({ upload, remove })),
    invoke: vi.fn(
      async (..._args: unknown[]): Promise<{ data: unknown; error: unknown }> => ({
        data: { ok: true },
        error: null,
      }),
    ),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from }, functions: { invoke } },
}));

const isStandalone = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/install", () => ({ isStandalone }));

import {
  accountSnapshot,
  addScreenshots,
  deviceInfo,
  FEEDBACK_BUCKET,
  MAX_SCREENSHOTS,
  SCREENSHOT_ERRORS,
  submitFeedback,
  valuesMasked,
} from "@/lib/feedback";

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

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ error: null } satisfies UploadResult);
  remove.mockResolvedValue({ error: null });
  invoke.mockResolvedValue({ data: { ok: true }, error: null } satisfies InvokeResult);
  isStandalone.mockReturnValue(false);
});

describe("addScreenshots", () => {
  it("keeps images and appends them to what's already attached", () => {
    const first = image("a.png");
    const second = image("b.jpg", "image/jpeg");
    const { files, error } = addScreenshots([first], [second]);
    expect(files).toEqual([first, second]);
    expect(error).toBeNull();
  });

  it("rejects anything that isn't an image", () => {
    const { files, error } = addScreenshots([], [image("notes.pdf", "application/pdf")]);
    expect(files).toEqual([]);
    expect(error).toBe(SCREENSHOT_ERRORS.notAnImage);
  });

  it("rejects image types the bucket wouldn't take either", () => {
    const { files, error } = addScreenshots([], [image("logo.svg", "image/svg+xml")]);
    expect(files).toEqual([]);
    expect(error).toBe(SCREENSHOT_ERRORS.notAnImage);
  });

  it("rejects images over the size cap", () => {
    const { files, error } = addScreenshots([], [image("big.png", "image/png", 6e6)]);
    expect(files).toEqual([]);
    expect(error).toBe(SCREENSHOT_ERRORS.tooBig);
  });

  it("stops at the cap and says so", () => {
    const full = Array.from({ length: MAX_SCREENSHOTS }, (_, i) => image(`s${i}.png`));
    const { files, error } = addScreenshots(full, [image("one-too-many.png")]);
    expect(files).toHaveLength(MAX_SCREENSHOTS);
    expect(error).toBe(SCREENSHOT_ERRORS.tooMany);
  });
});

describe("deviceInfo", () => {
  it("reports where the report came from", () => {
    isStandalone.mockReturnValue(true);
    const info = deviceInfo();
    expect(info.user_agent).toBe(navigator.userAgent);
    expect(info.language).toBe(navigator.language);
    expect(info.timezone).toEqual(expect.any(String));
    expect(info.viewport).toBe(`${window.innerWidth}×${window.innerHeight}`);
    expect(info.standalone).toBe(true);
  });
});

describe("accountSnapshot", () => {
  it("packs the decrypted rows and the settings that read them", () => {
    const snapshot = accountSnapshot(
      {
        userId: "u1",
        email: "me@x.com",
        homeCurrency: "EUR",
        currencies: [{ code: "USD", rate: 1.1 }],
        e2eMode: "passphrase",
        transactions: [tx()],
        goldEntries: [gold()],
      },
      new Date("2026-09-15T12:00:00.000Z"),
    );
    expect(snapshot).toEqual({
      taken_at: "2026-09-15T12:00:00.000Z",
      account: { user_id: "u1", email: "me@x.com" },
      settings: {
        home_currency: "EUR",
        currencies: [{ code: "USD", rate: 1.1 }],
        encryption: "passphrase",
      },
      transactions: [tx()],
      gold_entries: [gold()],
    });
  });

  it("stamps the current time when none is given", () => {
    const before = Date.now();
    const snapshot = accountSnapshot({
      userId: "u1",
      email: null,
      homeCurrency: "USD",
      currencies: [],
      e2eMode: "default",
      transactions: [],
      goldEntries: [],
    });
    expect(Date.parse(snapshot.taken_at)).toBeGreaterThanOrEqual(before);
  });
});

describe("valuesMasked", () => {
  it("is true while locked", () => {
    expect(valuesMasked(true, [], [])).toBe(true);
  });

  it("is true while masked rows are still in memory after an unlock", () => {
    expect(valuesMasked(false, [tx({ amountMask: "a8F2" })], [])).toBe(true);
    expect(valuesMasked(false, [], [gold({ gramsMask: "9xQ" })])).toBe(true);
  });

  it("is false once everything is readable", () => {
    expect(valuesMasked(false, [tx()], [gold()])).toBe(false);
  });
});

describe("submitFeedback", () => {
  it("sends a message on its own without touching storage", async () => {
    const { error } = await submitFeedback({
      userId: "u1",
      message: "  the keypad eats zeros  ",
      screenshots: [],
      data: null,
    });
    expect(error).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("feedback", {
      body: {
        message: "the keypad eats zeros",
        screenshots: [],
        dataPath: null,
        device: expect.objectContaining({ user_agent: navigator.userAgent }),
      },
    });
  });

  it("uploads screenshots into the caller's own folder, named by type", async () => {
    await submitFeedback({
      userId: "u1",
      message: "look",
      screenshots: [image("a.png"), image("b.HEIC", "image/heic"), image("c", "image/jpg")],
      data: null,
    });
    expect(from).toHaveBeenCalledWith(FEEDBACK_BUCKET);
    const paths = upload.mock.calls.map((c) => c[0] as string);
    expect(paths).toEqual([
      expect.stringMatching(/^u1\/[0-9a-f]{16}\/shot-1\.png$/),
      expect.stringMatching(/^u1\/[0-9a-f]{16}\/shot-2\.heic$/),
      expect.stringMatching(/^u1\/[0-9a-f]{16}\/shot-3\.jpg$/),
    ]);
    // One ticket folder for the whole report.
    expect(new Set(paths.map((p) => p.split("/")[1])).size).toBe(1);
    const { body } = invoke.mock.calls[0][1] as { body: { screenshots: string[] } };
    expect(body.screenshots).toEqual(paths);
  });

  it("uploads the account dump alongside, and names it separately", async () => {
    await submitFeedback({
      userId: "u1",
      message: "my totals are wrong",
      screenshots: [image()],
      data: accountSnapshot({
        userId: "u1",
        email: "me@x.com",
        homeCurrency: "USD",
        currencies: [],
        e2eMode: "default",
        transactions: [tx()],
        goldEntries: [],
      }),
    });
    const paths = upload.mock.calls.map((c) => c[0] as string);
    expect(paths[1]).toMatch(/^u1\/[0-9a-f]{16}\/account-data\.json$/);
    const { body } = invoke.mock.calls[0][1] as {
      body: { screenshots: string[]; dataPath: string };
    };
    // The dump is never listed as a screenshot.
    expect(body.screenshots).toEqual([paths[0]]);
    expect(body.dataPath).toBe(paths[1]);
  });

  it("clears up what it uploaded when a screenshot fails part-way", async () => {
    upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "boom" } });
    const { error } = await submitFeedback({
      userId: "u1",
      message: "look",
      screenshots: [image("a.png"), image("b.png")],
      data: null,
    });
    expect(error).toMatch(/Couldn't send that/);
    expect(remove).toHaveBeenCalledWith([expect.stringContaining("shot-1.png")]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("clears up the screenshots when the data dump is what fails", async () => {
    upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "boom" } });
    const { error } = await submitFeedback({
      userId: "u1",
      message: "look",
      screenshots: [image("a.png")],
      data: accountSnapshot({
        userId: "u1",
        email: null,
        homeCurrency: "USD",
        currencies: [],
        e2eMode: "default",
        transactions: [],
        goldEntries: [],
      }),
    });
    expect(error).toMatch(/Couldn't send that/);
    expect(remove).toHaveBeenCalledWith([expect.stringContaining("shot-1.png")]);
  });

  it("has nothing to clear up when the very first upload fails", async () => {
    upload.mockResolvedValueOnce({ error: { message: "boom" } });
    const { error } = await submitFeedback({
      userId: "u1",
      message: "look",
      screenshots: [image("a.png")],
      data: null,
    });
    expect(error).toMatch(/Couldn't send that/);
    expect(remove).not.toHaveBeenCalled();
  });

  it("reports a friendly error when the function refuses", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "non-2xx" } } satisfies InvokeResult);
    const { error } = await submitFeedback({
      userId: "u1",
      message: "look",
      screenshots: [],
      data: null,
    });
    expect(error).toMatch(/Couldn't send that/);
    // The function cleans up its own attachments, so the client doesn't.
    expect(remove).not.toHaveBeenCalled();
  });

  it("still names an attachment it wasn't expecting", async () => {
    await submitFeedback({
      userId: "u1",
      message: "look",
      screenshots: [image("odd.tiff", "image/tiff")],
      data: null,
    });
    expect(upload.mock.calls[0][0]).toMatch(/shot-1\.img$/);
  });

  it("trims a runaway message to the cap", async () => {
    await submitFeedback({
      userId: "u1",
      message: "x".repeat(5000),
      screenshots: [],
      data: null,
    });
    const { body } = invoke.mock.calls[0][1] as { body: { message: string } };
    expect(body.message).toHaveLength(4000);
  });
});
