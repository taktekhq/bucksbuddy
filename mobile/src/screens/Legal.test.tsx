// Adapted from the web's src/screens/Legal.test.tsx — same assertions about
// what a reader sees, with the web's `<a href>` checks becoming
// Linking.openURL calls (PORTING: an anchor is a Text with onPress here).
import { Linking } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigate = jest.fn();
jest.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => mockNavigate(...a) }));

import { Legal } from "@/screens/Legal";

describe("Legal page", () => {
  it("renders both the privacy and terms sections", async () => {
    await render(<Legal />);
    expect(screen.getByText("Privacy")).toBeOnTheScreen();
    expect(screen.getByText("Terms")).toBeOnTheScreen();
    expect(screen.getByText(/we don.t sell your data/i)).toBeOnTheScreen();
    expect(screen.getByText(/personal money journal/i)).toBeOnTheScreen();
  });

  it("discloses which Google account fields are used", async () => {
    await render(<Legal />);
    expect(
      screen.getByText(/name, email, and ID \(OpenID\) from Google/i),
    ).toBeOnTheScreen();
  });

  it("thoroughly discloses Google user data access, use, and Limited Use", async () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(true as unknown as never);
    await render(<Legal />);
    // The data accessed and how it's used must both be spelled out for Google's
    // API verification.
    expect(screen.getByText(/Google user data we access/i)).toBeOnTheScreen();
    expect(screen.getByText(/How we use Google user data/i)).toBeOnTheScreen();
    expect(screen.getByText(/we do not request access/i)).toBeOnTheScreen();
    // The Limited Use commitment must be present, linking the Google policy.
    expect(screen.getByText(/Limited Use requirements/i)).toBeOnTheScreen();

    const policyLink = screen.getByText(/Google API Services User Data Policy/i);
    await fireEvent.press(policyLink);
    expect(openURL).toHaveBeenCalledWith(
      "https://developers.google.com/terms/api-services-user-data-policy",
    );
    openURL.mockRestore();
  });

  it("links out to the Google permissions page and the support address", async () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(true as unknown as never);
    await render(<Legal />);
    await fireEvent.press(screen.getByText("Google Account permissions"));
    expect(openURL).toHaveBeenCalledWith("https://myaccount.google.com/permissions");
    await fireEvent.press(screen.getByText("nizar@taktek.io"));
    expect(openURL).toHaveBeenCalledWith("mailto:nizar@taktek.io");
    openURL.mockRestore();
  });

  it("goes back to the landing page from the Back button", async () => {
    await render(<Legal />);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
