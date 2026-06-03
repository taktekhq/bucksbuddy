import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStoreValue } from "@/test/storeValue";
import type { Transaction } from "@/types/db";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

let storeValue = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => storeValue }));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

import { Home } from "@/screens/Home";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    user_id: "u1",
    is_income: false,
    category: "groceries",
    amount_usd_cents: 1250,
    original_currency: "USD",
    original_amount: 12.5,
    rate_used: 89500,
    occurred_at: "2026-06-01T10:00:00.000Z",
    note: null,
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeValue = makeStoreValue();
    vi.stubGlobal("scrollTo", vi.fn());
  });

  it("shows the loading state before any transactions arrive", () => {
    storeValue = makeStoreValue({ loading: true, transactions: [] });
    render(<Home />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows a locked screen and routes to Settings to unlock", async () => {
    storeValue = makeStoreValue({ locked: true });
    render(<Home />);
    expect(screen.getByText("Locked")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Unlock in Settings" }),
    );
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("keeps the safe balance hidden until revealed", async () => {
    storeValue = makeStoreValue({ safeTotalCents: 5000, safeGoldGrams: 2 });
    render(<Home />);
    expect(screen.getByText("••••")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show safe balance" }));
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("2 g")).toBeInTheDocument();
  });

  it("navigates to the safe and settings", async () => {
    render(<Home />);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(navigate).toHaveBeenCalledWith("/settings");
    await userEvent.click(screen.getByRole("button", { name: "Safe" }));
    expect(navigate).toHaveBeenCalledWith("/safe");

    // The balance card itself is also a shortcut into the safe.
    navigate.mockClear();
    await userEvent.click(screen.getByText("In the safe"));
    expect(navigate).toHaveBeenCalledWith("/safe");
  });

  it("enters edit mode and scrolls to the top", async () => {
    storeValue = makeStoreValue({ transactions: [tx()] });
    render(<Home />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(window.scrollTo).toHaveBeenCalled();
    const cancel = screen.getByRole("button", { name: "Cancel edit" });
    expect(cancel).toBeInTheDocument();

    // Cancelling clears edit mode (exercises Home's clearEdit handler).
    await userEvent.click(cancel);
    expect(screen.queryByRole("button", { name: "Cancel edit" })).not.toBeInTheDocument();
  });

  it("deletes a row when confirmed, and not when cancelled", async () => {
    storeValue = makeStoreValue({ transactions: [tx()] });
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<Home />);

    confirmSpy.mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(storeValue.deleteTransaction).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(storeValue.deleteTransaction).toHaveBeenCalledWith("t1");
    confirmSpy.mockRestore();
  });
});
