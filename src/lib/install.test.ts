import { describe, it, expect, vi, afterEach } from "vitest";
import { installTarget, isStandalone } from "@/lib/install";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "standalone");
});

describe("isStandalone", () => {
  it("is false in a plain browser tab (jsdom has no matchMedia)", () => {
    expect(isStandalone()).toBe(false);
  });

  it("trusts the display-mode media query", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(isStandalone()).toBe(true);
  });

  it("falls through to Safari's flag when the query says no", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    expect(isStandalone()).toBe(false);
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
  });
});

describe("installTarget", () => {
  it("spots iPhones and iPads", () => {
    expect(installTarget("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)")).toBe("ios");
    expect(installTarget("Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)")).toBe("ios");
  });

  it("spots Android", () => {
    expect(installTarget("Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) Chrome/140")).toBe("android");
  });

  it("stays quiet on desktops, reading the browser's own user agent by default", () => {
    expect(installTarget("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Safari/605.1.15")).toBeNull();
    expect(installTarget()).toBeNull(); // jsdom
  });
});
