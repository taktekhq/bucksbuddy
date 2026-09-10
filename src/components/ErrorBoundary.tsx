import { Component, type ErrorInfo, type ReactNode } from "react";
import { Carrot } from "@/components/ui/Carrot";
import posthog from "@/lib/posthog";

// A render crash unmounts the whole React tree: a blank page with no way out
// and no report. This catches it, tells PostHog what broke and where, and
// offers the two things that reliably help: try again, or reload.
//
// It deliberately touches neither the store nor the router. Either could be
// what just broke, so the fallback is plain, self-contained chrome.
type Props = { children: ReactNode };
type State = { crashed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    posthog.captureException(error, {
      // Which tree failed: the most useful thing when reading this back weeks
      // later with no idea what the user was doing.
      component_stack: info.componentStack,
      source: "render",
    });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-8 text-center">
        <Carrot className="text-6xl" />
        <h1 className="text-xl font-bold text-label">That&apos;s not supposed to happen, Doc.</h1>
        <p className="text-[15px] leading-relaxed text-label-secondary">
          Something broke on this screen. Your entries are safe: they live on
          the server, not in this browser.
        </p>
        <div className="mt-2 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => this.setState({ crashed: false })}
            className="press w-full rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="press w-full rounded-pill bg-surface py-3.5 text-base font-semibold text-label-muted"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
