import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

import { HistoryTimeline } from "@/components/HistoryTimeline";
import { groupByCategory } from "@/lib/history";
import type { TimelineDay } from "@/lib/history";
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

function day(overrides: Partial<TimelineDay>): TimelineDay {
  return {
    key: "2026-06-01",
    label: "Jun 1",
    totalCents: 1250,
    masked: false,
    groups: groupByCategory([tx()]),
    ...overrides,
  };
}

describe("HistoryTimeline", () => {
  it("colors a non-zero, unmasked day's signed total", () => {
    render(
      <HistoryTimeline
        days={[day({ key: "spent", totalCents: -9900, masked: false })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const total = screen.getByText("-$99.00");
    expect(total).toHaveClass("text-expense");
  });

  it("renders an even day's zero total in the muted label color", () => {
    render(
      <HistoryTimeline
        days={[day({ key: "even", totalCents: 0, masked: false })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("$0.00")).toHaveClass("text-white/55");
  });

  it("masks the day total when any entry is obscured", () => {
    render(
      <HistoryTimeline
        days={[day({ key: "locked", totalCents: 1250, masked: true })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("••••")).toBeInTheDocument();
  });
});
