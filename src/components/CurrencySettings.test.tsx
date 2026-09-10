import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { makeStoreValue } from "@/test/storeValue";
import { CURRENCIES } from "@/lib/currency";
import type { Transaction } from "@/types/db";

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

import { CurrencySettings } from "@/components/CurrencySettings";

function tx(): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1250,
    original_currency: "USD",
    original_amount: 12.5,
    rate_used: 1,
    occurred_at: "2026-06-01T10:00:00.000Z",
    note: null,
    created_at: "2026-06-01T10:00:00.000Z",
  };
}

const select = () => screen.getByLabelText("Main currency") as HTMLSelectElement;
const rate = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

/** Blur `el` inside act so the commit's state updates are flushed. */
async function blur(el: HTMLElement) {
  await act(async () => {
    fireEvent.blur(el);
  });
}

describe("CurrencySettings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storeValue = makeStoreValue();
  });
  afterEach(() => vi.useRealTimers());

  it("lists the main currency and each secondary with its rate", () => {
    render(<CurrencySettings />);
    expect(select().value).toBe("USD");
    expect(rate("LBP per $1").value).toBe("89500");
    expect(screen.getByLabelText("Add currency")).toBeInTheDocument();
  });

  it("labels each rate against the main currency's symbol", () => {
    storeValue = makeStoreValue({
      homeCurrency: "EUR",
      currencies: [
        { code: "USD", rate: 1.08 },
        { code: "LBP", rate: 97000 },
      ],
    });
    render(<CurrencySettings />);
    expect(rate("USD per €1").value).toBe("1.08");
    expect(rate("LBP per €1").value).toBe("97000");
  });

  it("spaces a lettered symbol in the label", () => {
    storeValue = makeStoreValue({
      homeCurrency: "LBP",
      currencies: [{ code: "USD", rate: 0.0000112 }],
    });
    render(<CurrencySettings />);
    expect(rate("USD per LL 1")).toBeInTheDocument();
  });

  it("strips everything but digits and one dot from a rate", () => {
    render(<CurrencySettings />);
    fireEvent.change(rate("LBP per $1"), { target: { value: "9a0.0.5" } });
    expect(rate("LBP per $1").value).toBe("90.05");
  });

  it("commits a changed rate on blur and flashes a check", async () => {
    render(<CurrencySettings />);
    fireEvent.change(rate("LBP per $1"), { target: { value: "90000" } });
    await blur(rate("LBP per $1"));
    expect(storeValue.setCurrencies).toHaveBeenCalledWith([{ code: "LBP", rate: 90000 }]);
    // The check clears after the timeout.
    act(() => vi.advanceTimersByTime(1500));
  });

  it("changes one rate without touching the others", async () => {
    storeValue = makeStoreValue({
      currencies: [
        { code: "LBP", rate: 89500 },
        { code: "EUR", rate: 0.92 },
      ],
    });
    render(<CurrencySettings />);
    fireEvent.change(rate("EUR per $1"), { target: { value: "0.9" } });
    await blur(rate("EUR per $1"));
    expect(storeValue.setCurrencies).toHaveBeenCalledWith([
      { code: "LBP", rate: 89500 },
      { code: "EUR", rate: 0.9 },
    ]);
  });

  it("commits on Enter, and ignores other keys", async () => {
    render(<CurrencySettings />);
    const input = rate("LBP per $1");
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "91000" } });
    fireEvent.keyDown(input, { key: "a" });
    expect(storeValue.setCurrencies).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" }); // blurs → commits
    });
    expect(storeValue.setCurrencies).toHaveBeenCalledWith([{ code: "LBP", rate: 91000 }]);
  });

  it("does nothing when the rate is unchanged", async () => {
    render(<CurrencySettings />);
    await blur(rate("LBP per $1"));
    expect(storeValue.setCurrencies).not.toHaveBeenCalled();
  });

  it("reverts junk on blur", async () => {
    render(<CurrencySettings />);
    fireEvent.change(rate("LBP per $1"), { target: { value: "" } });
    await blur(rate("LBP per $1"));
    expect(rate("LBP per $1").value).toBe("89500");
    expect(storeValue.setCurrencies).not.toHaveBeenCalled();
  });

  it("follows a rate that changes underneath it", () => {
    const { rerender } = render(<CurrencySettings />);
    storeValue = makeStoreValue({ currencies: [{ code: "LBP", rate: 90000 }] });
    rerender(<CurrencySettings />);
    expect(rate("LBP per $1").value).toBe("90000");
  });

  it("removes a currency", async () => {
    render(<CurrencySettings />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove LBP" }));
    });
    expect(storeValue.setCurrencies).toHaveBeenCalledWith([]);
  });

  it("adds a currency once a rate is typed for it", async () => {
    render(<CurrencySettings />);
    fireEvent.change(screen.getByLabelText("Add currency"), { target: { value: "EUR" } });
    // The picker gives way to the new row until the rate is in.
    expect(screen.queryByLabelText("Add currency")).not.toBeInTheDocument();
    const input = rate("EUR per $1");
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "0.92" } });
    await blur(input);
    expect(storeValue.setCurrencies).toHaveBeenCalledWith([
      { code: "LBP", rate: 89500 },
      { code: "EUR", rate: 0.92 },
    ]);
    expect(screen.getByLabelText("Add currency")).toBeInTheDocument();
  });

  it("drops a picked currency when no rate is typed", async () => {
    render(<CurrencySettings />);
    fireEvent.change(screen.getByLabelText("Add currency"), { target: { value: "EUR" } });
    await blur(rate("EUR per $1"));
    expect(screen.queryByLabelText("EUR per $1")).not.toBeInTheDocument();
    expect(storeValue.setCurrencies).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Add currency")).toBeInTheDocument();
  });

  it("drops a picked currency from its remove button too", () => {
    render(<CurrencySettings />);
    fireEvent.change(screen.getByLabelText("Add currency"), { target: { value: "EUR" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove EUR" }));
    expect(screen.queryByLabelText("EUR per $1")).not.toBeInTheDocument();
    expect(storeValue.setCurrencies).not.toHaveBeenCalled();
  });

  it("keeps the picked row when saving its rate fails", async () => {
    storeValue = makeStoreValue({
      setCurrencies: vi.fn(async () => ({ error: "offline" })),
    });
    render(<CurrencySettings />);
    fireEvent.change(screen.getByLabelText("Add currency"), { target: { value: "EUR" } });
    fireEvent.change(rate("EUR per $1"), { target: { value: "0.92" } });
    await blur(rate("EUR per $1"));
    expect(screen.getByText("offline")).toBeInTheDocument();
    expect(rate("EUR per $1")).toBeInTheDocument();
  });

  it("hides the picker once every currency is in use", () => {
    storeValue = makeStoreValue({
      currencies: CURRENCIES.filter((c) => c.code !== "USD").map((c) => ({
        code: c.code,
        rate: 1,
      })),
    });
    render(<CurrencySettings />);
    expect(screen.queryByLabelText("Add currency")).not.toBeInTheDocument();
  });

  it("switches the main currency straight away with no entries yet", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<CurrencySettings />);
    await act(async () => {
      fireEvent.change(select(), { target: { value: "EUR" } });
    });
    expect(storeValue.setHomeCurrency).toHaveBeenCalledWith("EUR");
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("asks first once there are entries, and takes no for an answer", async () => {
    storeValue = makeStoreValue({ transactions: [tx()] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CurrencySettings />);
    await act(async () => {
      fireEvent.change(select(), { target: { value: "EUR" } });
    });
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/main currency to EUR/));
    expect(storeValue.setHomeCurrency).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await act(async () => {
      fireEvent.change(select(), { target: { value: "GBP" } });
    });
    expect(storeValue.setHomeCurrency).toHaveBeenCalledWith("GBP");
    confirmSpy.mockRestore();
  });

  it("surfaces an error from switching the main currency", async () => {
    storeValue = makeStoreValue({
      setHomeCurrency: vi.fn(async () => ({ error: "denied" })),
    });
    render(<CurrencySettings />);
    await act(async () => {
      fireEvent.change(select(), { target: { value: "EUR" } });
    });
    expect(screen.getByText("denied")).toBeInTheDocument();
  });
});
