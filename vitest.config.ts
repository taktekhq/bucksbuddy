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
    // The default 5s is too tight for the noble crypto vectors: pure-JS
    // PBKDF2 at 600k iterations is ~750ms per call (see docs/EXPO_MIGRATION.md,
    // Validator #4), and several run per test under coverage instrumentation.
    testTimeout: 20_000,
    setupFiles: ["./src/test/setup.ts"],
    // Unit/component tests live next to the source as *.test.ts(x).
    include: ["src/**/*.test.{ts,tsx}", "packages/core/src/**/*.test.ts"],
    // The golden-fixture corpus (src/lib/__fixtures__) freezes absolute local
    // calendar dates into checked-in JSON, so it must generate identically
    // regardless of which machine runs it. Pinned to UTC, which is also what
    // the CI runner uses — see golden.test.ts.
    env: { TZ: "UTC" },
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      // Cover all application source, plus the shared core now that crypto has
      // moved out from under src/lib — otherwise it silently drops out of the
      // 100% gate and only mutation testing (nightly) would ever touch it.
      // Exclude the bits that are pure bootstrap/types/config/data with no
      // testable logic of their own.
      include: ["src/**/*.{ts,tsx}", "packages/core/src/**/*.ts"],
      exclude: [
        "src/main.tsx", // app entry: mounts React + registers the service worker
        "src/types/**", // type-only declarations (no runtime code)
        "src/test/**", // the test harness itself
        "src/lib/__fixtures__/**", // golden-fixture generator: test infra, not app logic
        "src/**/*.test.{ts,tsx}", // the tests themselves
        "packages/core/src/**/*.test.ts", // the tests themselves
        "src/vite-env.d.ts",
        "**/*.d.ts",
        "packages/core/src/crypto-vectors.ts", // frozen data, no logic
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
