import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import posthog from "@/lib/posthog";
import { InstallHint } from "@/components/InstallHint";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

function pretendPhone(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

function pretendInstalled() {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
}

/** Fire Chrome's install offer the way the browser does, and hand it back. */
function offerInstall(outcome: "accepted" | "dismissed") {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "userAgent");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InstallHint", () => {
  it("shows nothing on a desktop", () => {
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing once the app is on the Home Screen", () => {
    pretendPhone(IPHONE);
    pretendInstalled();
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it("gives iPhone users Safari's steps", () => {
    pretendPhone(IPHONE);
    render(<InstallHint />);
    expect(screen.getByText("Add to Home Screen")).toBeInTheDocument();
    expect(screen.getByText("In Safari, tap Share, then Add to Home Screen.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("gives Android users the menu route until Chrome offers a prompt", () => {
    pretendPhone(ANDROID);
    render(<InstallHint />);
    expect(
      screen.getByText("In Chrome, open the menu, then Add to Home screen."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("turns Chrome's prompt into an Install button and reports the answer", async () => {
    pretendPhone(ANDROID);
    const capture = vi.spyOn(posthog, "capture");
    render(<InstallHint />);
    const event = offerInstall("accepted");

    // Chrome's own mini-infobar is suppressed in favour of our button.
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText("Keep it a tap away. No app store needed.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith("install_prompt_answered", { outcome: "accepted" }),
    );
    // One prompt per page load, so the button goes with it.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument(),
    );
  });

  it("disappears and reports when the app gets installed", () => {
    pretendPhone(ANDROID);
    const capture = vi.spyOn(posthog, "capture");
    const { container } = render(<InstallHint />);
    offerInstall("accepted");
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(container).toBeEmptyDOMElement();
    expect(capture).toHaveBeenCalledWith("pwa_installed");
  });

  it("stops listening when unmounted", () => {
    pretendPhone(ANDROID);
    const capture = vi.spyOn(posthog, "capture");
    const { unmount } = render(<InstallHint />);
    unmount();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("can sit in a titled section, with extra classes on the card", () => {
    pretendPhone(IPHONE);
    const { container } = render(<InstallHint header="On your phone" className="mt-6" />);
    expect(screen.getByRole("heading", { name: "On your phone" })).toBeInTheDocument();
    expect(container.querySelector(".mt-6")).not.toBeNull();
  });
});
