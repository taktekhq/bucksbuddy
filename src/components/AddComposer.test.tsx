import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import type { Transaction } from "@/types/db";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

import { AddComposer } from "@/components/AddComposer";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "edit1",
    user_id: "u1",
    is_income: true,
    category: "salary",
    amount_usd_cents: 5000,
    original_currency: "USD",
    original_amount: 50,
    rate_used: 89500,
    occurred_at: "2026-06-01T10:00:00.000Z",
    note: "paycheck",
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

async function chooseCategory(name: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: /Add Category/ }));
  await userEvent.click(await screen.findByRole("button", { name: name }));
}

describe("AddComposer (add mode)", () => {
  beforeEach(() => {
    storeValue = makeStoreValue();
  });

  it("guides the user from amount to category to a ready CTA", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    expect(screen.getByRole("button", { name: "Enter an amount" })).toBeDisabled();

    const amount = screen.getByLabelText("Amount");
    await userEvent.type(amount, "12.50");
    expect(screen.getByRole("button", { name: "Choose a category" })).toBeDisabled();

    await chooseCategory(/Gas/);
    expect(screen.getByRole("button", { name: "Add $12.50" })).toBeEnabled();
  });

  it("sanitizes the amount to digits, one dot and two decimals", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "1a2.3.456" } });
    expect(amount.value).toBe("12.34");
  });

  it("shows thousands separators in the amount input as you type", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    await userEvent.type(amount, "1234567.89");
    expect(amount.value).toBe("1,234,567.89");
  });

  it("switches to LBP and shows the USD estimate plus grouped label", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Switch currency" }));
    const amount = screen.getByLabelText("Amount");
    await userEvent.type(amount, "895000");
    expect(screen.getByText(/≈ \$10\.00/)).toBeInTheDocument();
    await chooseCategory(/Gas/);
    expect(
      screen.getByRole("button", { name: "Add 895,000 LBP" }),
    ).toBeInTheDocument();
  });

  it("groups large LBP amounts with decimals in the CTA", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Switch currency" }));
    await userEvent.type(screen.getByLabelText("Amount"), "1234567.5");
    await chooseCategory(/Gas/);
    expect(
      screen.getByRole("button", { name: "Add 1,234,567.5 LBP" }),
    ).toBeInTheDocument();
  });

  it("toggles the currency back and forth", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    const toggle = screen.getByRole("button", { name: "Switch currency" });
    await userEvent.click(toggle); // USD → LBP
    expect(toggle).toHaveTextContent("LBP");
    await userEvent.click(toggle); // LBP → USD
    expect(toggle).toHaveTextContent("USD");
  });

  it("closes the category sheet when the backdrop is tapped", async () => {
    const { container } = render(
      <AddComposer editing={null} onClearEdit={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Add Category/ }));
    expect(screen.getByRole("button", { name: /Groceries/ })).toBeInTheDocument();
    const backdrop = container.querySelector(".bg-black\\/30") as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("button", { name: /Groceries/ })).not.toBeInTheDocument();
  });

  it("saves a new transaction and resets the form", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await userEvent.type(screen.getByLabelText("Amount"), "10");
    await chooseCategory(/Gas/);
    await userEvent.type(screen.getByLabelText("Note"), "  fuel  ");
    await userEvent.click(screen.getByRole("button", { name: "Add $10.00" }));

    expect(storeValue.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        is_income: false,
        category: "gas",
        amount_usd_cents: 1000,
        original_currency: "USD",
        original_amount: 10,
        note: "fuel",
      }),
    );
    // Form resets back to the empty state.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Enter an amount" })).toBeInTheDocument(),
    );
  });

  it("stores a null note when left blank", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await userEvent.type(screen.getByLabelText("Amount"), "5");
    await chooseCategory(/Gas/);
    await userEvent.click(screen.getByRole("button", { name: "Add $5.00" }));
    expect(storeValue.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
    );
  });

  it("resets the category when the direction changes", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await userEvent.type(screen.getByLabelText("Amount"), "5");
    await chooseCategory(/Gas/);
    expect(screen.getByText("Gas")).toBeInTheDocument();

    // Reopen the sheet and flip to income — category should clear.
    await userEvent.click(screen.getByRole("button", { name: /Change/ }));
    await userEvent.click(screen.getByRole("button", { name: "In" }));
    expect(screen.getByRole("button", { name: "Choose a category" })).toBeInTheDocument();
  });

  it("shows the error returned by the store and keeps the input", async () => {
    storeValue = makeStoreValue({
      addTransaction: vi.fn(async () => ({ error: "Server said no" })),
    });
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await userEvent.type(screen.getByLabelText("Amount"), "5");
    await chooseCategory(/Gas/);
    await userEvent.click(screen.getByRole("button", { name: "Add $5.00" }));
    expect(await screen.findByText("Server said no")).toBeInTheDocument();
  });

  it("shows a Saving… state while the save is in flight", async () => {
    let resolve!: (v: { error: null }) => void;
    storeValue = makeStoreValue({
      addTransaction: vi.fn(
        () => new Promise<{ error: null }>((r) => (resolve = r)),
      ),
    });
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await userEvent.type(screen.getByLabelText("Amount"), "5");
    await chooseCategory(/Gas/);
    await userEvent.click(screen.getByRole("button", { name: "Add $5.00" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
    resolve({ error: null });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Enter an amount" })).toBeInTheDocument(),
    );
  });
});

describe("AddComposer (edit mode)", () => {
  beforeEach(() => {
    storeValue = makeStoreValue();
  });

  it("prefills from the editing transaction and saves an update", async () => {
    const onClearEdit = vi.fn();
    render(<AddComposer editing={tx()} onClearEdit={onClearEdit} />);
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("50");
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("paycheck");

    await userEvent.click(screen.getByRole("button", { name: "Save $50.00" }));
    expect(storeValue.updateTransaction).toHaveBeenCalledWith(
      "edit1",
      expect.objectContaining({ category: "salary", amount_usd_cents: 5000 }),
    );
    await waitFor(() => expect(onClearEdit).toHaveBeenCalled());
  });

  it("can cancel an edit", async () => {
    const onClearEdit = vi.fn();
    render(<AddComposer editing={tx()} onClearEdit={onClearEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(onClearEdit).toHaveBeenCalled();
  });

  it("clears the editing note when it was null", () => {
    render(<AddComposer editing={tx({ note: null })} onClearEdit={() => {}} />);
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("");
  });
});

describe("AddComposer (other currencies)", () => {
  beforeEach(() => {
    storeValue = makeStoreValue({
      homeCurrency: "EUR",
      currencies: [{ code: "USD", rate: 1.25 }], // 1.25 USD per €1
    });
  });

  it("types in the home currency by default and converts a secondary at its rate", async () => {
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    expect(screen.getByText("€")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Amount"), "12.50");
    await chooseCategory(/Gas/);
    expect(screen.getByRole("button", { name: "Add €12.50" })).toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Switch currency" }));
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("≈ €10.00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add 12.50 USD" }));
    expect(storeValue.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_usd_cents: 1000,
        original_currency: "USD",
        original_amount: 12.5,
        rate_used: 1.25,
      }),
    );
  });

  it("cycles through every currency in Settings and back to home", async () => {
    storeValue = makeStoreValue({
      currencies: [
        { code: "LBP", rate: 89500 },
        { code: "EUR", rate: 0.9 },
      ],
    });
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    const toggle = screen.getByRole("button", { name: "Switch currency" });
    expect(toggle).toHaveTextContent("USD");
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("LBP");
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("EUR");
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("USD");
  });

  it("has nothing to switch to with only the home currency set up", () => {
    storeValue = makeStoreValue({ currencies: [] });
    render(<AddComposer editing={null} onClearEdit={() => {}} />);
    expect(screen.queryByRole("button", { name: "Switch currency" })).not.toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
  });

  it("keeps a removed currency on offer while editing an entry typed in it", async () => {
    storeValue = makeStoreValue({ currencies: [] }); // LBP no longer set up
    render(
      <AddComposer
        editing={tx({
          original_currency: "LBP",
          original_amount: 90000,
          rate_used: 90000,
          amount_usd_cents: 100,
        })}
        onClearEdit={() => {}}
      />,
    );
    // The entry's own currency, at the rate it was saved with.
    expect(screen.getByText("LL")).toBeInTheDocument();
    expect(screen.getByText("≈ $1.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save 90,000 LBP" })).toBeInTheDocument();
    // And the toggle still offers home.
    await userEvent.click(screen.getByRole("button", { name: "Switch currency" }));
    expect(screen.getByRole("button", { name: "Save $90,000.00" })).toBeInTheDocument();
  });

  it("folds a pick that Settings no longer offers back to home", async () => {
    storeValue = makeStoreValue({ currencies: [{ code: "LBP", rate: 89500 }] });
    const { rerender } = render(<AddComposer editing={null} onClearEdit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Switch currency" }));
    expect(screen.getByText("LL")).toBeInTheDocument();
    // LBP disappears from Settings underneath the open composer.
    storeValue = makeStoreValue({ currencies: [] });
    rerender(<AddComposer editing={null} onClearEdit={() => {}} />);
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
  });
});
