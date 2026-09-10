import posthog from "posthog-js";

// The one analytics client the app talks to. Everything goes through
// `capture` / `identify` / `reset`, so that is the whole surface.
type Analytics = Pick<typeof posthog, "capture" | "identify" | "reset">;

// Two cases deliberately never reach PostHog:
//   * no key — a fresh checkout without .env.local. Analytics degrade to a
//     silent no-op so the app still runs.
//   * the test suite — Vitest renders the real components under jsdom, and
//     with a .env.local present those renders sent real events from
//     localhost:3000 into the production project (25 of its first 54 "users"
//     were jsdom). src/test/setup.ts also stubs posthog-js as a backstop.
const noop: Analytics = {
  capture: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
};

function client(): Analytics {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || import.meta.env.MODE === "test") return noop;
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST as string,
    defaults: "2026-05-30",
  });
  return posthog;
}

export default client();
