import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The module decides at import time, so every case gets a fresh registry and
// re-imports both the client and the (stubbed) posthog-js it wraps.
async function load() {
  vi.resetModules();
  const lib = (await import("posthog-js")).default;
  const client = (await import("@/lib/posthog")).default;
  return { lib, client };
}

beforeEach(() => {
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analytics client", () => {
  it("never initialises under the test suite, even with a key", async () => {
    const { lib, client } = await load();
    expect(lib.init).not.toHaveBeenCalled();
    expect(client).not.toBe(lib);
    // The no-op surface is callable and returns nothing.
    expect(client.capture("signed_in")).toBeUndefined();
    expect(client.captureException(new Error("x"))).toBeUndefined();
    expect(client.identify("u1")).toBeUndefined();
    expect(client.reset()).toBeUndefined();
  });

  it("is a no-op without a key", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    const { lib, client } = await load();
    expect(lib.init).not.toHaveBeenCalled();
    expect(client).not.toBe(lib);
  });

  it("initialises the real client in a build with a key", async () => {
    vi.stubEnv("MODE", "production");
    const { lib, client } = await load();
    expect(lib.init).toHaveBeenCalledWith("phc_test", {
      api_host: "https://eu.i.posthog.com",
      defaults: "2026-05-30",
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
    });
    expect(lib.register).toHaveBeenCalledWith({ display_mode: "browser" });
    expect(client).toBe(lib);
  });

  it("stamps events from a Home Screen install as standalone", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const { lib } = await load();
    expect(lib.register).toHaveBeenCalledWith({ display_mode: "standalone" });
  });
});
