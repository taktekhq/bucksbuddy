import posthog from "posthog-js";
import { isStandalone } from "@/lib/install";

// The one analytics client the app talks to. Everything goes through these
// four calls, so that is the whole surface.
type Analytics = Pick<typeof posthog, "capture" | "captureException" | "identify" | "reset">;

// Two cases deliberately never reach PostHog:
//   * no key — a fresh checkout without .env.local. Analytics degrade to a
//     silent no-op so the app still runs.
//   * the test suite — Vitest renders the real components under jsdom, and
//     with a .env.local present those renders sent real events from
//     localhost:3000 into the production project (25 of its first 54 "users"
//     were jsdom). src/test/setup.ts also stubs posthog-js as a backstop.
const noop: Analytics = {
  capture: () => undefined,
  captureException: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
};

function client(): Analytics {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || import.meta.env.MODE === "test") return noop;
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST as string,
    defaults: "2026-05-30",
    // Uncaught errors and unhandled rejections outside React's render path;
    // the ErrorBoundary reports the ones inside it. Console errors stay out:
    // too noisy for what they add.
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
  // Stamped on every event, so we can finally see how many people run the app
  // from the Home Screen rather than a browser tab.
  posthog.register({ display_mode: isStandalone() ? "standalone" : "browser" });
  return posthog;
}

export default client();
