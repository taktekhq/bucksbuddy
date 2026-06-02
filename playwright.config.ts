import { defineConfig, devices } from "@playwright/test";

// End-to-end / visual tests run in a real browser (Chromium) against the
// actual built app — the layer jsdom can't cover. Kept separate from the fast
// Vitest unit suite (see vitest.config.ts).
//
// First run, or after an intentional UI change, regenerate the screenshot
// baselines with `npm run test:e2e:update` and commit the resulting PNGs.
// Baselines are platform-dependent (fonts/AA), so generate them in the same
// environment CI uses (Linux). See README "Testing".
const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  // Snapshots (baseline PNGs) live alongside the specs and are committed.
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // A consistent portrait viewport — BucksBuddy is a portrait-only PWA.
    viewport: { width: 390, height: 844 },
  },
  // A little tolerance for font anti-aliasing differences between machines.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
  // Build once, then serve the production bundle so screenshots match prod.
  webServer: {
    command: "npm run build && npm run preview -- --port " + PORT,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
