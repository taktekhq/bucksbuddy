import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Belt and braces against analytics leaking out of the test run: src/lib/posthog
// already refuses to initialise under MODE=test, and on top of that posthog-js
// itself is a stub here, so no test can reach the production project even if a
// .env.local with a real key is lying around.
vi.mock("posthog-js", () => ({
  default: {
    init: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

// Unmount React trees and reset the document between tests.
afterEach(() => {
  cleanup();
});
