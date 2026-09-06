// Adapted from the web's src/components/ui/InOutToggle.test.tsx. The web
// asserts the active side by its fill class; classes are inert in this
// harness, so the direction the control reports is what is asserted here.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { InOutToggle } from "@/components/ui/InOutToggle";

// RNTL 14 renders through React 19's concurrent root: a second bare
// `fireEvent` in the same test opens an act() scope over the first one and
// leaves the next test's tree unmounted. Each press gets its own awaited act.
const press = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
};

describe("InOutToggle", () => {
  it("renders both sides of the segmented control", async () => {
    await render(<InOutToggle isIncome={false} onChange={() => {}} />);
    expect(screen.getByText("Out")).toBeOnTheScreen();
    expect(screen.getByText("In")).toBeOnTheScreen();
  });

  it("reports direction changes", async () => {
    const onChange = jest.fn();
    await render(<InOutToggle isIncome={false} onChange={onChange} />);
    await press("In");
    expect(onChange).toHaveBeenCalledWith(true);
    await press("Out");
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("reports the side that is already active too, rather than toggling", async () => {
    // Both segments are always live: pressing "In" while In is active says
    // "income", it does not flip back to expense.
    const onChange = jest.fn();
    await render(<InOutToggle isIncome onChange={onChange} />);
    await press("In");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders the same two sides whichever direction is active", async () => {
    await render(<InOutToggle isIncome onChange={() => {}} />);
    expect(screen.getByText("Out")).toBeOnTheScreen();
    expect(screen.getByText("In")).toBeOnTheScreen();
  });
});
