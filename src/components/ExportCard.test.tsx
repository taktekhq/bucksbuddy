import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import { FETCH_CAP } from "@/lib/stats";
import posthog from "@/lib/posthog";
import type { Transaction } from "@/types/db";

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

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

/** jsdom's Blob has no .text(), so go through FileReader. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

/** Open the card and hand back the anchor-click spy the download goes through. */
async function openCard() {
  render(<ExportCard />);
  await userEvent.click(screen.getByRole("button", { name: /Export/ }));
  return vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  storeValue = makeStoreValue({ transactions: [tx()] });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
});

describe("ExportCard — the closed row", () => {
  it("starts as a single row", () => {
    render(<ExportCard />);
    expect(screen.getByRole("button", { name: /Export/ })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("is disabled while the device is locked", () => {
    storeValue = makeStoreValue({ locked: true });
    render(<ExportCard />);
    expect(screen.getByRole("button", { name: /Export/ })).toBeDisabled();
  });

  it("opens and closes again", async () => {
    render(<ExportCard />);
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});

describe("ExportCard — locking", () => {
  it("collapses and locks down if the device locks while it is open", async () => {
    const { rerender } = render(<ExportCard />);
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();

    // The store re-locks (a stored passphrase found stale). Locked rows carry
    // masked, zeroed amounts, so the export must not stay reachable.
    storeValue = makeStoreValue({ transactions: [tx()], locked: true });
    rerender(<ExportCard />);

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CSV" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export/ })).toBeDisabled();
  });

  it("stays shut while rows are still masked, even once locked is false", () => {
    // store.unlock() clears `locked` before awaiting the reload, so for that
    // window the rows are masked stand-ins with zeroed amounts.
    storeValue = makeStoreValue({
      locked: false,
      transactions: [tx({ amount_usd_cents: 0, note: null, amountMask: "····" })],
    });
    render(<ExportCard />);
    expect(screen.getByRole("button", { name: /Export/ })).toBeDisabled();
  });

  it("does not spring back open when the rows unmask", async () => {
    const { rerender } = render(<ExportCard />);
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();

    storeValue = makeStoreValue({ locked: true, transactions: [tx()] });
    rerender(<ExportCard />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    // Unlocking must not re-reveal live export buttons under the user's finger.
    storeValue = makeStoreValue({ locked: false, transactions: [tx()] });
    rerender(<ExportCard />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CSV" })).not.toBeInTheDocument();
  });
});

describe("ExportCard — choosing a range", () => {
  it("offers the four ranges with this month checked", async () => {
    await openCard();
    const options = screen.getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual([
      "This month",
      "Last month",
      "Past 3 months",
      "All time",
    ]);
    expect(options[0]).toBeChecked();
  });

  it("moves the tick to whichever range is tapped", async () => {
    await openCard();
    await userEvent.click(screen.getByRole("radio", { name: "Past 3 months" }));
    expect(screen.getByRole("radio", { name: "Past 3 months" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "This month" })).not.toBeChecked();
  });

  it("counts what the chosen range holds, in the singular", async () => {
    await openCard();
    expect(screen.getByText(/1 entry ·/)).toBeInTheDocument();
  });

  it("counts in the plural, and re-counts when the range changes", async () => {
    storeValue = makeStoreValue({ transactions: [tx(), tx({ id: "t2" })] });
    await openCard();
    expect(screen.getByText(/2 entries ·/)).toBeInTheDocument();

    // Nothing was entered last month, so the count drops to zero.
    await userEvent.click(screen.getByRole("radio", { name: "Last month" }));
    expect(screen.getByText(/0 entries ·/)).toBeInTheDocument();
  });
});

describe("ExportCard — downloading", () => {
  it("downloads a CSV named for the range", async () => {
    const click = await openCard();
    const download = vi.spyOn(HTMLAnchorElement.prototype, "download", "set");
    await userEvent.click(screen.getByRole("button", { name: "CSV" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await readBlob(blob)).toContain("date,type,category");
    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/^bucksbuddy-this-month-\d{4}-\d{2}-\d{2}\.csv$/),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("carries the SELECTED range into the file, not the default", async () => {
    const click = await openCard();
    const download = vi.spyOn(HTMLAnchorElement.prototype, "download", "set");
    await userEvent.click(screen.getByRole("radio", { name: "Last month" }));
    await userEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/^bucksbuddy-last-month-\d{4}-\d{2}-\d{2}\.pdf$/),
    );
    // And the range reaches the document itself, as its printed subtitle.
    // (Read as UTF-8, so stop before the WinAnsi "·" separator byte.)
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const pdf = await readBlob(blob);
    expect(pdf).toContain("(Last month");
    expect(pdf).not.toContain("(This month");
  });

  it("downloads a PDF", async () => {
    const click = await openCard();
    await userEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
    expect(await readBlob(blob)).toContain("%PDF-1.4");
  });

  it("only exports the rows inside the chosen range", async () => {
    const old = new Date(2020, 0, 15, 12, 0, 0);
    storeValue = makeStoreValue({
      transactions: [tx(), tx({ id: "t2", occurred_at: old.toISOString() })],
    });
    const click = await openCard();
    await userEvent.click(screen.getByRole("button", { name: "CSV" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    // Header plus the one in-range row — the 2020 entry is left out.
    expect((await readBlob(blob)).trim().split("\n")).toHaveLength(2);
  });
});

describe("ExportCard — analytics", () => {
  it("reports the format, range and row count", async () => {
    const capture = vi.spyOn(posthog, "capture");
    await openCard();
    await userEvent.click(screen.getByRole("button", { name: "CSV" }));
    expect(capture).toHaveBeenCalledWith("csv_exported", {
      range: "this_month",
      row_count: 1,
    });

    await userEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(capture).toHaveBeenCalledWith("pdf_exported", {
      range: "this_month",
      row_count: 1,
    });
  });

  it("stays quiet about truncation below the fetch cap", async () => {
    const capture = vi.spyOn(posthog, "capture");
    await openCard();
    await userEvent.click(screen.getByRole("button", { name: "CSV" }));
    expect(capture).not.toHaveBeenCalledWith("export_truncated", expect.anything());
  });

  it("flags an export taken at the fetch cap as partial", async () => {
    storeValue = makeStoreValue({
      transactions: Array.from({ length: FETCH_CAP }, (_, i) => tx({ id: String(i) })),
    });
    const capture = vi.spyOn(posthog, "capture");
    await openCard();
    await userEvent.click(screen.getByRole("radio", { name: "All time" }));
    await userEvent.click(screen.getByRole("button", { name: "CSV" }));

    expect(capture).toHaveBeenCalledWith("export_truncated", {
      range: "all_time",
      format: "csv",
      row_count: FETCH_CAP,
      fetch_cap: FETCH_CAP,
    });
  });
});
