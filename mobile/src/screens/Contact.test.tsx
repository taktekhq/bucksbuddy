// Adapted from the web's src/screens/Contact.test.tsx. The web asserts on the
// `<a href="mailto:…">`; on native the same affordance is a Press that calls
// Linking.openURL, so that's what's asserted here.
import { Linking } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigate = jest.fn();
jest.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => mockNavigate(...a) }));

import { Contact } from "@/screens/Contact";

describe("Contact page", () => {
  it("shows a mailto link to the support address", async () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(true as unknown as never);
    await render(<Contact />);
    expect(screen.getByText("nizar@taktek.io")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("nizar@taktek.io"));
    expect(openURL).toHaveBeenCalledWith("mailto:nizar@taktek.io");
    openURL.mockRestore();
  });

  it("goes back to the landing page from the Back button", async () => {
    await render(<Contact />);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
