import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import posthog from "@/lib/posthog";
import { ErrorBoundary } from "@/components/ErrorBoundary";

let explode = false;
function Screen() {
  if (explode) throw new Error("kaboom");
  return <p>All good, Doc.</p>;
}

beforeEach(() => {
  explode = false;
  // React and jsdom both log a caught render error; keep the run readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ErrorBoundary", () => {
  it("renders its children while nothing is wrong", () => {
    render(
      <ErrorBoundary>
        <Screen />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good, Doc.")).toBeInTheDocument();
  });

  it("swaps in the fallback and reports the crash", () => {
    const captureException = vi.spyOn(posthog, "captureException");
    explode = true;
    render(
      <ErrorBoundary>
        <Screen />
      </ErrorBoundary>,
    );

    expect(screen.getByText("That's not supposed to happen, Doc.")).toBeInTheDocument();
    expect(screen.queryByText("All good, Doc.")).not.toBeInTheDocument();

    expect(captureException).toHaveBeenCalled();
    const [error, props] = captureException.mock.lastCall!;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("kaboom");
    expect(props).toEqual({
      source: "render",
      component_stack: expect.stringContaining("Screen"),
    });
  });

  it("tries again in place", async () => {
    explode = true;
    render(
      <ErrorBoundary>
        <Screen />
      </ErrorBoundary>,
    );
    explode = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("All good, Doc.")).toBeInTheDocument();
  });

  it("reloads the page", async () => {
    vi.stubGlobal("location", { reload: vi.fn() });
    explode = true;
    render(
      <ErrorBoundary>
        <Screen />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
