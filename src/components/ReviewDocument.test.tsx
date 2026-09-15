import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewDocument } from "@/components/ReviewDocument";
import type { ReviewFindings, ReviewProse } from "@/types/db";

const findings = (over: Partial<ReviewFindings> = {}): ReviewFindings => ({
  version: 2,
  headline: "Steady months, with delivery climbing",
  standing: "steady",
  findings: [
    {
      kind: "improve",
      basis: "logged",
      title: "Delivery is the line to hold down",
      detail: "It carries about a fifth of what you spent.",
      evidence: [{ label: "Delivery", value: "$210.00" }],
      category: "Food · Delivery",
    },
  ],
  blindSpots: ["Nearly half the days have nothing logged."],
  ...over,
});

const finding = (over: Partial<ReviewFindings["findings"][0]> = {}) => ({
  kind: "good",
  basis: "logged",
  title: "Groceries held flat",
  detail: "The daily rate barely moved across the window.",
  evidence: [],
  category: null,
  ...over,
});

describe("ReviewDocument — the auditor's findings", () => {
  it("leads with the verdict, the window and the direction of travel", () => {
    render(<ReviewDocument review={findings()} subtitle="Recent months · June 2026" />);
    screen.getByText("Recent months · June 2026");
    screen.getByText("Steady months, with delivery climbing");
    screen.getByText("Steady");
  });

  it("renders a finding's claim, its reasoning and its evidence", () => {
    render(<ReviewDocument review={findings()} subtitle="x" />);
    screen.getByText("Delivery is the line to hold down");
    screen.getByText("It carries about a fifth of what you spent.");
    screen.getByText("Delivery");
    screen.getByText("$210.00");
  });

  it("names each finding's kind for a screen reader, not by colour alone", () => {
    render(
      <ReviewDocument
        review={findings({
          findings: [finding(), finding({ kind: "improve" }), finding({ kind: "swap" })],
        })}
        subtitle="x"
      />,
    );
    screen.getByText("Working:");
    screen.getByText("Worth a look:");
    screen.getByText("Could cost less:");
  });

  it("reads good news first, then what to hold down, then what could cost less", () => {
    render(
      <ReviewDocument
        review={findings({
          findings: [
            finding({ kind: "swap", title: "Third" }),
            finding({ kind: "improve", title: "Second" }),
            finding({ kind: "good", title: "First" }),
          ],
        })}
        subtitle="x"
      />,
    );
    const shown = screen
      .getAllByRole("heading", { level: 4 })
      .map((h) => h.textContent);
    expect(shown).toEqual(["First", "Second", "Third"]);
  });

  it("renders a kind it has never met rather than dropping the finding", () => {
    // A newer function wrote this review and the installed app is a version
    // behind. The finding is already paid for; it renders unmarked.
    render(
      <ReviewDocument
        review={findings({ findings: [finding({ kind: "goal", title: "Ahead of target" })] })}
        subtitle="x"
      />,
    );
    screen.getByText("Ahead of target");
    screen.getByText("Finding:");
  });

  it("sorts a kind it has never met after the three it knows", () => {
    // Not dropped, and not promoted above the ranked three either.
    render(
      <ReviewDocument
        review={findings({
          findings: [
            finding({ kind: "goal", title: "From the future" }),
            finding({ kind: "improve", title: "Second" }),
            finding({ kind: "good", title: "First" }),
          ],
        })}
        subtitle="x"
      />,
    );
    const shown = screen
      .getAllByRole("heading", { level: 4 })
      .map((h) => h.textContent);
    expect(shown).toEqual(["First", "Second", "From the future"]);
  });

  it("prints a standing it has never met as itself", () => {
    render(<ReviewDocument review={findings({ standing: "accelerating" })} subtitle="x" />);
    screen.getByText("accelerating");
  });

  it("names every standing it does know", () => {
    for (const [value, shown] of [
      ["improving", "Improving"],
      ["slipping", "Slipping"],
      ["unclear", "Not enough to say"],
    ]) {
      const { unmount } = render(
        <ReviewDocument review={findings({ standing: value })} subtitle="x" />,
      );
      screen.getByText(shown);
      unmount();
    }
  });

  it("shows the blind spots, and leaves them out when there are none", () => {
    const { unmount } = render(<ReviewDocument review={findings()} subtitle="x" />);
    screen.getByText("Nearly half the days have nothing logged.");
    unmount();
    render(<ReviewDocument review={findings({ blindSpots: [] })} subtitle="x" />);
    expect(screen.queryByText("Nearly half the days have nothing logged.")).toBeNull();
  });

  it("leaves out the evidence pills when a finding carries none", () => {
    render(<ReviewDocument review={findings({ findings: [finding()] })} subtitle="x" />);
    expect(screen.queryByRole("definition")).toBeNull();
  });

  it("says what this is and is not, every time", () => {
    render(<ReviewDocument review={findings()} subtitle="x" />);
    screen.getByText("Reads what you logged. Not financial advice.");
  });
});

// A review bought before the redesign is the reader's, and it opens as it was
// written. Nothing generates this shape now.
const prose = (over: Partial<ReviewProse> = {}): ReviewProse => ({
  version: 1,
  title: "Three months of takeaway",
  summary: "Spending held steady; food is the story.",
  sections: [
    {
      heading: "Where it went",
      body: "Food led every month.\n\nCoffee was second.",
      figures: [{ label: "Food", value: "$412.00" }],
    },
  ],
  notables: ["Coffee twice a day in July"],
  caveats: ["August has 6 unlogged days"],
  ...over,
});

describe("ReviewDocument — the superseded prose shape", () => {
  it("still renders every field it was written with", () => {
    render(<ReviewDocument review={prose()} subtitle="Past 3 months · June 2026" />);
    screen.getByText("Past 3 months · June 2026");
    screen.getByText("Three months of takeaway");
    screen.getByText("Spending held steady; food is the story.");
    screen.getByText("Where it went");
    screen.getByText("Food led every month.");
    screen.getByText("Coffee was second.");
    screen.getByText("Food");
    screen.getByText("$412.00");
    screen.getByText("Coffee twice a day in July");
    screen.getByText("August has 6 unlogged days");
  });

  it("drops the blank lines between paragraphs rather than rendering them", () => {
    render(<ReviewDocument review={prose()} subtitle="x" />);
    const paragraphs = screen
      .getByText("Food led every month.")
      .parentElement!.querySelectorAll("p");
    expect([...paragraphs].map((p) => p.textContent)).toEqual([
      "Food led every month.",
      "Coffee was second.",
    ]);
  });

  it("leaves out the sections it has none of", () => {
    render(
      <ReviewDocument
        review={prose({ sections: [], notables: [], caveats: [] })}
        subtitle="x"
      />,
    );
    expect(screen.queryByText("Worth noticing")).toBeNull();
    expect(screen.queryByText("What this review couldn't see")).toBeNull();
  });

  it("leaves out a section's figure tiles when it has none", () => {
    render(
      <ReviewDocument
        review={prose({ sections: [{ heading: "h", body: "b", figures: [] }] })}
        subtitle="x"
      />,
    );
    expect(screen.queryByRole("definition")).toBeNull();
  });
});
