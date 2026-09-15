import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
      "“subscription” or “membership”Counts as recurring from the first entry.",
      "“(yearly)”, “(monthly)”, “(weekly)”Sets how often it repeats.",
      "“(ended)”Drops it off the Recurring page.",
    ]);
    expect(sheet).not.toHaveTextContent("domain");
    expect(sheet).not.toHaveTextContent("with");
    // Short enough to read at a glance: every line under 70 characters.
    for (const line of sheet.querySelectorAll("li p")) {
      expect(line.textContent!.length).toBeLessThanOrEqual(70);
    }
  });

  it("closes from the button, the backdrop, and a downward drag", () => {
    const onClose = vi.fn();
    const { container } = render(<NoteTipsSheet open onClose={onClose} />);

    void userEvent; // the sheet is driven with fireEvent below
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
