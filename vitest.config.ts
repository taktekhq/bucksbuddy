import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// A dedicated Vitest config so the PWA plugin (and its virtual modules) stay
// out of the test run. We keep the same "@" alias the app uses.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Unit/component tests live next to the source as *.test.ts(x). The
    // Playwright end-to-end specs in ./e2e are run by Playwright, not Vitest.
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      // Cover all application source. Exclude the bits that are pure
      // bootstrap/types/config with no testable logic of their own.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx", // app entry: mounts React + registers the service worker
        "src/types/**", // type-only declarations (no runtime code)
        "src/test/**", // the test harness itself
        "src/**/*.test.{ts,tsx}", // the tests themselves
        "src/vite-env.d.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
