import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthBars, type MonthBar } from "@/components/ui/MonthBars";

const bar = (over: Partial<MonthBar> = {}): MonthBar => ({
  key: "2026-06",
  label: "June 2026",
  short: "Jun",
  cents: 50000,
  display: "$500.00",
  days: 30,
  monthDays: 30,
  ...over,
});

const columns = () =>
  Array.from(
    screen.getByTestId("month-bars").querySelectorAll("li > div"),
  ) as HTMLElement[];

describe("MonthBars", () => {
  it("draws nothing at all for an empty series", () => {
    const { container } = render(
      <MonthBars bars={[]} color="#5AC4D6" label="Spent per month" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("scales each bar against the tallest", () => {
    render(
      <MonthBars
        bars={[
          bar({ key: "a", cents: 50000 }),
          bar({ key: "b", cents: 25000 }),
          bar({ key: "c", cents: 100000 }),
        ]}
        color="#5AC4D6"
        label="Spent per month"
      />,
    );
    const heights = columns().map((el) => el.style.height);
    expect(heights).toEqual(["50%", "25%", "100%"]);
  });

  it("keeps a visible floor under an empty month", () => {
    // A gap in the middle of the chart has to read as zero rather than as a
    // month that is missing.
    render(
      <MonthBars
        bars={[bar({ key: "a", cents: 0, display: "$0.00" }), bar({ key: "b" })]}
        color="#5AC4D6"
        label="Spent per month"
      />,
    );
    expect(columns()[0].style.height).toBe("2%");
  });

  it("draws a whole month solid", () => {
    render(<MonthBars bars={[bar(), bar({ key: "b" })]} color="#5AC4D6" label="x" />);
    const [first] = columns();
    expect(first.style.backgroundColor).toBe("rgb(90, 196, 214)");
    expect(first.style.backgroundImage).toBe("");
  });

  it("hatches a month the window only partly covers", () => {
    // The whole reason this component exists: a window that ends today ends
    // part-way through its last month, so that bar is shorter for a reason the
    // reader did nothing about — and a bar chart is read as a comparison
    // whether or not the caption says otherwise.
    render(
      <MonthBars
        bars={[bar(), bar({ key: "2026-09", short: "Sep", days: 15, monthDays: 30 })]}
        color="#5AC4D6"
        label="x"
      />,
    );
    const [, last] = columns();
    expect(last.style.backgroundColor).toBe("transparent");
    expect(last.style.backgroundImage).toContain("repeating-linear-gradient");
  });

  it("says how far into a partial month it got, for a screen reader", () => {
    render(
      <MonthBars
        bars={[
          bar(),
          bar({
            key: "2026-09",
            label: "September 2026",
            days: 15,
            monthDays: 30,
            display: "$210.00",
          }),
        ]}
        color="#5AC4D6"
        label="x"
      />,
    );
    screen.getByLabelText("June 2026: $500.00");
    screen.getByLabelText("September 2026: $210.00 over 15 days so far");
  });

  it("labels every bar with its month and figure while there is room", () => {
    render(
      <MonthBars
        bars={[bar(), bar({ key: "b", short: "Jul", display: "$610.00" })]}
        color="#5AC4D6"
        label="x"
      />,
    );
    screen.getByText("Jun");
    screen.getByText("$500.00");
    screen.getByText("$610.00");
  });

  it("labels only the ends once the bars are too thin to caption", () => {
    // Thirty "Jan"s under two-pixel bars is noise, and centring one in a
    // two-pixel column truncates it to nothing anyway.
    const many = Array.from({ length: 12 }, (_, i) =>
      bar({ key: `m${i}`, short: `M${i}`, display: `$${i}.00` }),
    );
    render(<MonthBars bars={many} color="#5AC4D6" label="x" />);
    screen.getByText("M0");
    screen.getByText("M11");
    expect(screen.queryByText("M5")).toBeNull();
    expect(screen.queryByText("$5.00")).toBeNull();
  });

  it("names the chart as one image rather than a dozen graphics", () => {
    render(<MonthBars bars={[bar(), bar({ key: "b" })]} color="#5AC4D6" label="Spent per month" />);
    screen.getByRole("img", { name: "Spent per month" });
  });
});
