import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

import { HistorySheet } from "@/components/HistorySheet";
import type { Transaction } from "@/types/db";

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

function setup(props: Partial<React.ComponentProps<typeof HistorySheet>> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <HistorySheet
      open
      rows={[tx()]}
      onEdit={onEdit}
      onDelete={onDelete}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...utils, onEdit, onDelete, onClose };
}

describe("HistorySheet", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders nothing when closed", () => {
    const { container } = setup({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a title and one stack per category", () => {
    setup({
      rows: [
        tx({ id: "a", category: "gas" }),
        tx({ id: "b", category: "coffee" }),
        tx({ id: "c", category: "coffee" }),
      ],
    });
    expect(screen.getByText("All history")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    // Coffee has two entries → a stack; Gas has one → a plain row.
    expect(screen.getByRole("button", { name: /Coffee, 2 entries/ })).toBeInTheDocument();
  });

  it("closes from the close button and the overlay", () => {
    const { onClose, container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const overlay = container.querySelector(".bg-black\\/30") as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes the sheet before editing a row", () => {
    const order: string[] = [];
    const onClose = vi.fn(() => order.push("close"));
    const onEdit = vi.fn(() => order.push("edit"));
    render(
      <HistorySheet
        open
        rows={[tx()]}
        onEdit={onEdit}
        onDelete={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["close", "edit"]);
  });
});
