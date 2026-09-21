import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("framer-motion", async () => (await import("@/test/framerMock")).default);

import { NoteTipsSheet } from "@/components/ui/NoteTipsSheet";

type Motion = {
  onDragEnd: (e: unknown, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => void;
};

describe("NoteTipsSheet", () => {
  it("renders nothing while closed", () => {
    render(<NoteTipsSheet open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog", { name: "Note tips" })).not.toBeInTheDocument();
  });

  it("lists the cheat codes when open", () => {
    render(<NoteTipsSheet open onClose={() => {}} />);
    const sheet = screen.getByRole("dialog", { name: "Note tips" });
    expect(sheet).toHaveTextContent("Recurring payments");
    expect(sheet).toHaveTextContent("Same note, same payment");
    // The keywords sit together under one header, as sub-points.
    const keywords = screen.getByText("Recurring keywords").parentElement!;
    const points = [...keywords.querySelectorAll("li")].map((li) => li.textContent);
    expect(points).toEqual([
      "Start a recurring itemFirst note: add (monthly), (yearly) or (weekly).",
      "Stop a recurring itemLast note: add (ended).",
      "Tell two of the same apartTag one of them: (work). Any word in brackets does.",
    ]);
    // The keywords themselves read as code (plain, with nowhere to put them).
    expect([...keywords.querySelectorAll("code")].map((c) => c.textContent)).toEqual([
      "(monthly)", "(yearly)", "(weekly)", "(ended)", "(work)",
    ]);
    // "subscription" still works, it just isn't taught.
    expect(sheet).not.toHaveTextContent("subscription");
    expect(within(keywords).queryByRole("button")).not.toBeInTheDocument();
    expect(sheet).not.toHaveTextContent("domain");
    expect(sheet).not.toHaveTextContent("with");
    // Short enough to read at a glance: every line under 70 characters.
    for (const line of sheet.querySelectorAll("li p")) {
      expect(line.textContent!.length).toBeLessThanOrEqual(70);
    }
  });

  it("hands a tapped keyword over when given somewhere to put it", async () => {
    const onPick = vi.fn();
    render(<NoteTipsSheet open onClose={() => {}} onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "(yearly)" }));
    expect(onPick).toHaveBeenCalledWith("(yearly)");
    await userEvent.click(screen.getByRole("button", { name: "(ended)" }));
    expect(onPick).toHaveBeenCalledWith("(ended)");
  });

  it("closes from the button, the backdrop, and a downward drag", () => {
    const onClose = vi.fn();
    const { container } = render(<NoteTipsSheet open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector(".bg-black\\/30") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);

    const sheet = screen.getByRole("dialog", { name: "Note tips" }) as HTMLElement & {
      __motion: Motion;
    };
    // A short, slow drag doesn't dismiss.
    sheet.__motion.onDragEnd(null, { offset: { x: 0, y: 40 }, velocity: { x: 0, y: 0 } });
    expect(onClose).toHaveBeenCalledTimes(2);
    // Far enough does; so does a flick.
    sheet.__motion.onDragEnd(null, { offset: { x: 0, y: 200 }, velocity: { x: 0, y: 0 } });
    sheet.__motion.onDragEnd(null, { offset: { x: 0, y: 10 }, velocity: { x: 0, y: 900 } });
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});
