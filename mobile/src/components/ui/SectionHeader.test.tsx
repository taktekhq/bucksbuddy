// Adapted from the web's src/components/ui/SectionHeader.test.tsx. The web
// renders an <h2> and queries it by the "heading" role; React Native has no
// heading role, so the same assertion is made on the rendered text.
import { render, screen } from "@testing-library/react-native";
import { SectionHeader } from "@/components/ui/SectionHeader";

describe("SectionHeader", () => {
  it("renders its children", async () => {
    await render(<SectionHeader>History</SectionHeader>);
    expect(screen.getByText("History")).toBeOnTheScreen();
  });

  it("renders with a custom className passed through", async () => {
    await render(<SectionHeader className="mt-4">Account</SectionHeader>);
    expect(screen.getByText("Account")).toBeOnTheScreen();
  });

  it("renders composed children, not just a string", async () => {
    await render(
      <SectionHeader>
        {"What's up, "}
        {"Doc?"}
      </SectionHeader>,
    );
    expect(screen.getByText("What's up, Doc?")).toBeOnTheScreen();
  });
});
