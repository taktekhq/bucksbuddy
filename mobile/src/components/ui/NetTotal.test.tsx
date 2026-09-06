// Adapted from the web's src/components/ui/NetTotal.test.tsx. The web asserts
// the color class on the total; classes aren't styling in this harness (they
// pass through as an untranslated string), so the assertions here are on the
// text the component produces — the label, the sign, and the mask.
import { render, screen } from "@testing-library/react-native";
import { NetTotal } from "@/components/ui/NetTotal";

describe("NetTotal", () => {
  it("shows the month label and a positive signed total", async () => {
    await render(<NetTotal cents={8750} label="June 2026" />);
    expect(screen.getByText("June 2026")).toBeOnTheScreen();
    expect(screen.getByText("$87.50")).toBeOnTheScreen();
  });

  it("renders negative totals with a minus", async () => {
    await render(<NetTotal cents={-1250} label="June 2026" />);
    expect(screen.getByText("-$12.50")).toBeOnTheScreen();
  });

  it("renders zero without a sign", async () => {
    await render(<NetTotal cents={0} label="June 2026" />);
    expect(screen.getByText("$0.00")).toBeOnTheScreen();
  });

  it("obscures the number when masked, keeping the label", async () => {
    await render(<NetTotal cents={8750} label="June 2026" masked />);
    expect(screen.getByText("June 2026")).toBeOnTheScreen();
    expect(screen.getByText("$•••••")).toBeOnTheScreen();
    expect(screen.queryByText("$87.50")).toBeNull();
  });

  it("masks a negative total too, leaking neither the sign nor the size", async () => {
    await render(<NetTotal cents={-1250} label="June 2026" masked />);
    expect(screen.getByText("$•••••")).toBeOnTheScreen();
    expect(screen.queryByText("-$12.50")).toBeNull();
  });
});
