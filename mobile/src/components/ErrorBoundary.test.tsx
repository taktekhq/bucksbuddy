import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import posthog from "@/lib/posthog";

// React logs a console.error for every caught render error. That is expected
// here and only makes the output unreadable.
let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

function Boom(): never {
  throw new Error("kaboom");
}

// Whether this throws lives outside React on purpose: retrying remounts the
// child, so component state would reset and it would throw forever.
let stillBroken = true;
function BoomOnce() {
  if (stillBroken) throw new Error("kaboom");
  return <Text>recovered</Text>;
}

describe("ErrorBoundary", () => {
  it("shows its children when nothing is wrong", async () => {
    await render(
      <ErrorBoundary>
        <Text>the app</Text>
      </ErrorBoundary>,
    );
    expect(screen.getByText("the app")).toBeOnTheScreen();
  });

  it("replaces a crashed tree with something other than a white screen", async () => {
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("That's not supposed to happen, Doc.")).toBeOnTheScreen();
    expect(screen.getByText("Try again")).toBeOnTheScreen();
  });

  it("says the entries are not lost, because a money app crashing implies they are", async () => {
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/entries are safe/)).toBeOnTheScreen();
  });

  it("reports the crash with the component stack", async () => {
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(posthog.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "kaboom" }),
      expect.objectContaining({ source: "render" }),
    );
  });

  it("still reports when React gives no component stack", async () => {
    // React's ErrorInfo types componentStack as optional, and a crash report
    // with no stack is worth more than no report at all.
    const boundary = new ErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error("kaboom"), { componentStack: null });
    expect(posthog.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "kaboom" }),
      expect.objectContaining({ componentStack: null, source: "render" }),
    );
  });

  it("retries the tree when the user asks", async () => {
    stillBroken = true;
    await render(
      <ErrorBoundary>
        <BoomOnce />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Try again")).toBeOnTheScreen();

    // Whatever broke has passed — a dropped request, a transient bad state.
    stillBroken = false;
    await fireEvent.press(screen.getByText("Try again"));
    expect(screen.getByText("recovered")).toBeOnTheScreen();
  });
});
