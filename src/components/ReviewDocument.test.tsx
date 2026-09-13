import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewDocument } from "@/components/ReviewDocument";
import type { ReviewSection, SpendingReview } from "@/types/db";

function section(overrides: Partial<ReviewSection> = {}): ReviewSection {
  return {
    heading: "Where it went",
    body: "Groceries took the biggest share of the quarter.",
    figures: [],
    ...overrides,
  };
}

function review(overrides: Partial<SpendingReview> = {}): SpendingReview {
  return {
    title: "Three months, mostly groceries",
    summary: "Spending climbed through June and settled back by August.",
    sections: [section()],
    notables: [],
    caveats: [],
    ...overrides,
  };
}

/** The card wrapping one section — its <h4> heading's parent element. */
function card(heading: string): HTMLElement {
  return screen.getByRole("heading", { name: heading, level: 4 })
    .parentElement as HTMLElement;
}

/** The <dd> printed next to the <dt> carrying `label`, inside one section card. */
function figureValue(container: HTMLElement, label: string): string | null {
  const term = Array.from(container.querySelectorAll("dt")).find(
    (dt) => dt.textContent === label,
  );
  return term?.nextElementSibling?.textContent ?? null;
}

const DISCLAIMER = /It isn't financial advice\./;

describe("ReviewDocument", () => {
  it("renders the subtitle, title and summary", () => {
    render(
      <ReviewDocument
        review={review()}
        subtitle="Jun 1 – Aug 31, 2026 · USD"
      />,
    );

    expect(screen.getByText("Jun 1 – Aug 31, 2026 · USD")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Three months, mostly groceries", level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Spending climbed through June and settled back by August."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your review", level: 2 })).toBeInTheDocument();
  });

  it("renders every section's heading and body", () => {
    render(
      <ReviewDocument
        review={review({
          sections: [
            section({ heading: "Where it went", body: "Groceries led the quarter." }),
            section({ heading: "The rhythm", body: "You log in bursts, then go quiet." }),
            section({ heading: "What changed", body: "August was your calmest month." }),
          ],
        })}
        subtitle="Summer 2026"
      />,
    );

    for (const [heading, body] of [
      ["Where it went", "Groceries led the quarter."],
      ["The rhythm", "You log in bursts, then go quiet."],
      ["What changed", "August was your calmest month."],
    ]) {
      expect(screen.getByRole("heading", { name: heading, level: 4 })).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(3);
  });

  it("splits a body on newlines into separate paragraphs and drops blank lines", () => {
    render(
      <ReviewDocument
        review={review({
          sections: [
            section({
              heading: "The rhythm",
              // A blank line between the two paragraphs, and a trailing newline:
              // both must vanish rather than leaving empty <p> elements behind.
              body: "Rent landed on the first.\n\nGroceries followed all week.\n",
            }),
          ],
        })}
        subtitle="Summer 2026"
      />,
    );

    const paragraphs = Array.from(card("The rhythm").querySelectorAll("p"));
    expect(paragraphs.map((p) => p.textContent)).toEqual([
      "Rent landed on the first.",
      "Groceries followed all week.",
    ]);
  });

  it("keeps a body with no newline as a single paragraph", () => {
    render(
      <ReviewDocument
        review={review({
          sections: [section({ heading: "Where it went", body: "One line, one paragraph." })],
        })}
        subtitle="Summer 2026"
      />,
    );

    const paragraphs = Array.from(card("Where it went").querySelectorAll("p"));
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent("One line, one paragraph.");
  });

  it("renders figures as label/value pairs", () => {
    render(
      <ReviewDocument
        review={review({
          sections: [
            section({
              heading: "Where it went",
              figures: [
                { label: "Total spent", value: "$4,210.00" },
                { label: "Busiest month", value: "July" },
                { label: "Days logged", value: "62" },
              ],
            }),
          ],
        })}
        subtitle="Summer 2026"
      />,
    );

    const where = card("Where it went");
    expect(where.querySelectorAll("dl")).toHaveLength(1);
    expect(where.querySelectorAll("dt")).toHaveLength(3);
    expect(figureValue(where, "Total spent")).toBe("$4,210.00");
    expect(figureValue(where, "Busiest month")).toBe("July");
    expect(figureValue(where, "Days logged")).toBe("62");
  });

  it("renders no figure list for a section with an empty figures array", () => {
    render(
      <ReviewDocument
        review={review({
          sections: [
            section({ heading: "Where it went", figures: [{ label: "Total", value: "$10.00" }] }),
            section({ heading: "The rhythm", figures: [] }),
          ],
        })}
        subtitle="Summer 2026"
      />,
    );

    expect(card("Where it went").querySelectorAll("dl")).toHaveLength(1);
    expect(card("The rhythm").querySelectorAll("dl")).toHaveLength(0);
    expect(screen.getAllByRole("definition")).toHaveLength(1);
  });

  it("prints a figure's value verbatim, without reformatting the money", () => {
    render(
      <ReviewDocument
        review={review({
          sections: [
            section({
              heading: "Where it went",
              figures: [
                { label: "Raw", value: "1234.5" },
                { label: "Lira", value: "LL 1.000.000" },
              ],
            }),
          ],
        })}
        subtitle="Summer 2026"
      />,
    );

    const where = card("Where it went");
    expect(figureValue(where, "Raw")).toBe("1234.5");
    expect(figureValue(where, "Lira")).toBe("LL 1.000.000");
    // The device already formatted these; the component must not touch them.
    expect(screen.queryByText("$1,234.50")).not.toBeInTheDocument();
    expect(screen.queryByText("$1,000,000.00")).not.toBeInTheDocument();
  });

  it("renders the notables list when there are notables", () => {
    render(
      <ReviewDocument
        review={review({
          notables: ["Three coffee runs in one day.", "No groceries at all in the last week."],
        })}
        subtitle="Summer 2026"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Worth noticing", level: 2 }),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Three coffee runs in one day.",
      "No groceries at all in the last week.",
    ]);
  });

  it("omits the notables section when there are none", () => {
    render(<ReviewDocument review={review({ notables: [] })} subtitle="Summer 2026" />);

    expect(
      screen.queryByRole("heading", { name: "Worth noticing" }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders the caveats list when there are caveats", () => {
    render(
      <ReviewDocument
        review={review({
          caveats: ["Cash spending you never logged.", "Anything before June 1, 2026."],
        })}
        subtitle="Summer 2026"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "What this review couldn't see", level: 2 }),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Cash spending you never logged.",
      "Anything before June 1, 2026.",
    ]);
  });

  it("omits the caveats section when there are none", () => {
    render(<ReviewDocument review={review({ caveats: [] })} subtitle="Summer 2026" />);

    expect(
      screen.queryByRole("heading", { name: /couldn't see/ }),
    ).not.toBeInTheDocument();
  });

  it("always shows the not-financial-advice line", () => {
    const { unmount } = render(
      <ReviewDocument
        review={review({
          sections: [section({ figures: [{ label: "Total", value: "$1.00" }] })],
          notables: ["Something odd."],
          caveats: ["Cash is invisible."],
        })}
        subtitle="Summer 2026"
      />,
    );
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    unmount();

    // And on the barest possible review — no sections, notables or caveats.
    render(
      <ReviewDocument
        review={review({ sections: [], notables: [], caveats: [] })}
        subtitle="Summer 2026"
      />,
    );
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
  });
});
