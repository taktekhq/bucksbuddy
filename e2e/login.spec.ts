import { test, expect } from "@playwright/test";

// These run in a real browser against the built app. The login screen is the
// one view reachable with no Supabase session, which makes it a stable target
// for a visual baseline (no data, no animation, no clock-dependent text).

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Wait for the auth check to settle past the splash into the login screen,
  // and for the custom font to load, so the screenshot is stable.
  await expect(page.getByText("What's up, Doc?")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

test("renders the sign-in screen", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Bucks Buddy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with Google/ }),
  ).toBeVisible();
  // The hidden password form is not shown by default.
  await expect(page.getByPlaceholder("Email")).toBeHidden();
});

test("reveals the hidden password form after seven carrot taps", async ({
  page,
}) => {
  const carrot = page.getByRole("button", { name: "carrot" });
  for (let i = 0; i < 7; i++) await carrot.click();

  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("matches the login visual snapshot", async ({ page }) => {
  await expect(page).toHaveScreenshot("login.png", { fullPage: true });
});
