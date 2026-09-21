import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewDocument } from "@/components/ReviewDocument";
import { buildDigest } from "@/lib/reportDigest";
import { detectRecurring } from "@/lib/recurring";
import type { ReviewFindings, ReviewProse, Transaction } from "@/types/db";

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

describe("ReviewDocument — what Dad said", () => {
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
    screen.getByText("Doing right:");
    screen.getByText("Keep an eye on this:");
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
    screen.getByText("Dad only sees what you logged. Not financial advice.");
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

// --- Dad picking up where he left off ---
describe("ReviewDocument — since last time", () => {
  it("marks a finding that revisits what Dad said last time", () => {
    render(
      <ReviewDocument
        review={findings({
          findings: [finding({ basis: "followup", title: "I said this already" })],
        })}
        subtitle="x"
      />,
    );
    screen.getByText("Since last time");
    screen.getByText("I said this already");
  });

  it("says nothing of the sort on an ordinary finding", () => {
    render(<ReviewDocument review={findings()} subtitle="x" />);
    expect(screen.queryByText("Since last time")).toBeNull();
  });

  it("leaves a basis it has never met unmarked rather than unopenable", () => {
    // A newer server can file a finding under a basis this build predates; it
    // is still a finding, and the review still opens. Same rule as `kind`.
    render(
      <ReviewDocument
        review={findings({ findings: [finding({ basis: "goal" })] })}
        subtitle="x"
      />,
    );
    screen.getByText("Groceries held flat");
    expect(screen.queryByText("Since last time")).toBeNull();
  });
});

// --- putting a name to the charge Dad could only describe ---
//
// The matching itself is exercised in lib/reviewNaming.test.ts. These are about
// the one thing the component decides: whether the answer is on screen, and
// that nothing appears when there is no answer to give.
describe("ReviewDocument — naming a repeating charge", () => {
  const at = (y: number, m: number, d: number) =>
    new Date(y, m, d, 12).toISOString();
  const NOW = new Date(2026, 5, 10, 15);

  const rows: Transaction[] = [2, 3, 4, 5].map((month, i) => ({
    id: `t${i}`,
    user_id: "u1",
    is_income: false,
    category: "fees/subscriptions",
    amount_usd_cents: 1599,
    original_currency: "USD" as const,
    original_amount: 15.99,
    rate_used: 1,
    occurred_at: at(2026, month, 1),
    note: "Netflix",
    created_at: at(2026, month, 1),
  }));

  const digest = buildDigest(
    rows,
    { id: "last_3_months", from: new Date(2026, 2, 1), to: NOW },
    "USD",
  );
  const recurring = detectRecurring(rows, "u1", NOW);

  const repeat = findings({
    findings: [
      finding({
        kind: "swap",
        title: "Something repeats in Fees",
        detail: "Go and find out what that is.",
        evidence: [{ label: "Each time", value: "$15.99" }],
      }),
    ],
  });

  it("answers the errand with the note the reader typed", () => {
    render(
      <ReviewDocument
        review={repeat}
        subtitle="x"
        digest={digest}
        recurring={recurring}
        homeCurrency="USD"
      />,
    );
    // The name and the cadence, beside the finding that asked for them.
    screen.getByText("Netflix");
    screen.getByText(/Your note says/);
    screen.getByText(/Monthly/);
  });

  it("says nothing when it has no figures to match against", () => {
    // The archive opens reviews with no digest on screen for them; a finding
    // renders exactly as written rather than guessing.
    render(<ReviewDocument review={repeat} subtitle="x" />);
    expect(screen.queryByText("Netflix")).toBeNull();
    expect(screen.queryByText(/Your note says/)).toBeNull();
  });

  it("says nothing for a finding that is not about a repeating charge", () => {
    render(
      <ReviewDocument
        review={findings()}
        subtitle="x"
        digest={digest}
        recurring={recurring}
        homeCurrency="USD"
      />,
    );
    expect(screen.queryByText(/Your note says/)).toBeNull();
  });
});
