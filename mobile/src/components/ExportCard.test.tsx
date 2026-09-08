// Adapted from the web's src/components/ExportCard.test.tsx. The card and the
// range choices carry over one-for-one; the download differs by port — the
// browser's <a download> is a file written to the cache and handed to the share
// sheet — so those cases are rewritten around those calls.
import { render, screen, fireEvent } from "@testing-library/react-native";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import { FETCH_CAP } from "@/lib/stats";
import posthog from "@/lib/posthog";
import type { Transaction } from "@/types/db";

// Rendering the card (and the modules it drags in) can outrun jest's 5s
// default on a cold, loaded machine — see TESTING.md.
jest.setTimeout(30000);

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

import { ExportCard } from "@/components/ExportCard";

// Rows land in the current month unless a test says otherwise, so the default
// range ("This month") picks them up.
function tx(overrides: Partial<Transaction> = {}): Transaction {
  const now = new Date();
  const occurred = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0);
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1250,
    original_currency: "USD",
    original_amount: 12.5,
    rate_used: 89500,
    occurred_at: occurred.toISOString(),
    note: null,
    created_at: occurred.toISOString(),
    ...overrides,
  };
}

/** The file the card most recently wrote. */
const lastFile = () =>
  (File as unknown as jest.Mock).mock.results.at(-1)!.value as {
    uri: string;
    write: jest.Mock;
  };

async function openCard() {
  const view = await render(<ExportCard />);
  await fireEvent.press(screen.getByText("Export"));
  return view;
}

beforeEach(() => {
  mockStoreValue = makeStoreValue({ transactions: [tx()] });
});

describe("ExportCard — the closed row", () => {
  it("starts as a single row", async () => {
    await render(<ExportCard />);
    expect(screen.getByText("Export")).toBeOnTheScreen();
    expect(screen.queryByText("This month")).not.toBeOnTheScreen();
  });

  it("does not open while the device is locked", async () => {
    mockStoreValue = makeStoreValue({ locked: true });
    await render(<ExportCard />);
    await fireEvent.press(screen.getByText("Export"));
    expect(screen.queryByText("This month")).not.toBeOnTheScreen();
  });

  it("opens and closes again", async () => {
    await openCard();
    expect(screen.getByText("This month")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Export"));
    expect(screen.queryByText("This month")).not.toBeOnTheScreen();
  });
});

describe("ExportCard — locking", () => {
  it("collapses and locks down if the device locks while it is open", async () => {
    const { rerender } = await openCard();
    expect(screen.getByText("This month")).toBeOnTheScreen();

    // The store re-locks (a stored passphrase found stale). Locked rows carry
    // masked, zeroed amounts, so the export must not stay reachable. Re-render
    // the same instance — a fresh mount would start collapsed either way.
    mockStoreValue = makeStoreValue({ transactions: [tx()], locked: true });
    await rerender(<ExportCard />);

    expect(screen.queryByText("This month")).not.toBeOnTheScreen();
    expect(screen.queryByText("CSV")).not.toBeOnTheScreen();
  });

  it("stays shut while rows are still masked, even once locked is false", async () => {
    // store.unlock() clears `locked` before awaiting the reload, so for that
    // window the rows are masked stand-ins with zeroed amounts.
    mockStoreValue = makeStoreValue({
      locked: false,
      transactions: [tx({ amount_usd_cents: 0, note: null, amountMask: "····" })],
    });
    await render(<ExportCard />);
    await fireEvent.press(screen.getByText("Export"));
    expect(screen.queryByText("This month")).not.toBeOnTheScreen();
  });

  it("does not spring back open when the rows unmask", async () => {
    const { rerender } = await openCard();
    expect(screen.getByText("This month")).toBeOnTheScreen();

    mockStoreValue = makeStoreValue({ locked: true, transactions: [tx()] });
    await rerender(<ExportCard />);
    expect(screen.queryByText("This month")).not.toBeOnTheScreen();

    // Unlocking must not re-reveal live export buttons under the user's finger.
    mockStoreValue = makeStoreValue({ locked: false, transactions: [tx()] });
    await rerender(<ExportCard />);
    expect(screen.queryByText("This month")).not.toBeOnTheScreen();
    expect(screen.queryByText("CSV")).not.toBeOnTheScreen();
  });
});

describe("ExportCard — choosing a range", () => {
  it("offers the four ranges with this month checked", async () => {
    await openCard();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
    expect(screen.getByRole("radio", { checked: true, name: "This month" })).toBeOnTheScreen();
    for (const label of ["This month", "Last month", "Past 3 months", "All time"]) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
  });

  it("moves the tick to whichever range is tapped", async () => {
    await openCard();
    await fireEvent.press(screen.getByText("Past 3 months"));
    expect(
      screen.getByRole("radio", { checked: true, name: "Past 3 months" }),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it("counts what the chosen range holds, in the singular", async () => {
    await openCard();
    expect(screen.getByText(/1 entry ·/)).toBeOnTheScreen();
  });

  it("counts in the plural, and re-counts when the range changes", async () => {
    mockStoreValue = makeStoreValue({ transactions: [tx(), tx({ id: "t2" })] });
    await openCard();
    expect(screen.getByText(/2 entries ·/)).toBeOnTheScreen();

    // Nothing was entered last month, so the count drops to zero.
    await fireEvent.press(screen.getByText("Last month"));
    expect(screen.getByText(/0 entries ·/)).toBeOnTheScreen();
  });
});

describe("ExportCard — sharing", () => {
  it("writes a CSV to the cache and hands it to the share sheet", async () => {
    await openCard();
    await fireEvent.press(screen.getByText("CSV"));

    const file = lastFile();
    expect(file.uri).toMatch(/bucksbuddy-this-month-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.write).toHaveBeenCalledWith(expect.stringContaining("Groceries"));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      file.uri,
      expect.objectContaining({ mimeType: "text/csv" }),
    );
    expect(posthog.capture).toHaveBeenCalledWith("csv_exported", {
      range: "this_month",
      row_count: 1,
    });
  });

  it("writes a PDF as bytes, with the PDF share type", async () => {
    await openCard();
    await fireEvent.press(screen.getByText("PDF"));

    const file = lastFile();
    expect(file.uri).toMatch(/\.pdf$/);
    const written = file.write.mock.calls[0][0] as Uint8Array;
    expect(written).toBeInstanceOf(Uint8Array);
    // "%PDF" — the magic number, proving bytes and not a string went out.
    expect(Array.from(written.slice(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      file.uri,
      expect.objectContaining({ mimeType: "application/pdf", UTI: "com.adobe.pdf" }),
    );
    expect(posthog.capture).toHaveBeenCalledWith("pdf_exported", {
      range: "this_month",
      row_count: 1,
    });
  });

  it("carries the SELECTED range into the file, not the default", async () => {
    await openCard();
    await fireEvent.press(screen.getByText("Last month"));
    await fireEvent.press(screen.getByText("PDF"));

    const file = lastFile();
    expect(file.uri).toMatch(/bucksbuddy-last-month-\d{4}-\d{2}-\d{2}\.pdf$/);
    // And the range reaches the document itself, as its printed subtitle.
    const pdf = Array.from(file.write.mock.calls[0][0] as Uint8Array, (b) =>
      String.fromCharCode(b),
    ).join("");
    expect(pdf).toContain("(Last month");
    expect(pdf).not.toContain("(This month");
    expect(posthog.capture).toHaveBeenCalledWith("pdf_exported", {
      range: "last_month",
      row_count: 0,
    });
  });

  it("only exports the rows inside the chosen range", async () => {
    const old = new Date(2020, 0, 15, 12, 0, 0);
    mockStoreValue = makeStoreValue({
      transactions: [tx(), tx({ id: "t2", occurred_at: old.toISOString() })],
    });
    await openCard();
    await fireEvent.press(screen.getByText("CSV"));

    const csv = lastFile().write.mock.calls[0][0] as string;
    // Header plus the one in-range row — the 2020 entry is left out.
    expect(csv.trim().split("\n")).toHaveLength(2);
  });

  it("still records the export when there's no share sheet to hand it to", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await openCard();
    await fireEvent.press(screen.getByText("CSV"));

    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(posthog.capture).toHaveBeenCalledWith("csv_exported", {
      range: "this_month",
      row_count: 1,
    });
  });

  it("stays quiet when the export can't be written", async () => {
    (File as unknown as jest.Mock).mockImplementationOnce(() => ({
      uri: "/cache/nope.csv",
      write: () => {
        throw new Error("storage full");
      },
    }));
    await openCard();
    await fireEvent.press(screen.getByText("CSV"));

    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalledWith("csv_exported", expect.anything());
  });
});

describe("ExportCard — analytics", () => {
  it("stays quiet about truncation below the fetch cap", async () => {
    await openCard();
    await fireEvent.press(screen.getByText("CSV"));
    expect(posthog.capture).not.toHaveBeenCalledWith(
      "export_truncated",
      expect.anything(),
    );
  });

  it("flags an export taken at the fetch cap as partial", async () => {
    mockStoreValue = makeStoreValue({
      transactions: Array.from({ length: FETCH_CAP }, (_, i) => tx({ id: String(i) })),
    });
    await openCard();
    await fireEvent.press(screen.getByText("All time"));
    await fireEvent.press(screen.getByText("CSV"));

    expect(posthog.capture).toHaveBeenCalledWith("export_truncated", {
      range: "all_time",
      format: "csv",
      row_count: FETCH_CAP,
      fetch_cap: FETCH_CAP,
    });
  });
});
