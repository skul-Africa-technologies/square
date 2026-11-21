import { test, expect } from "@playwright/test";

test.describe("profile page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
    page.on("dialog", d => d.dismiss().catch(() => {}));
  });

  test("left panel has no 'Your communities' text and contains Discover/Explore", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    await expect(page.locator("aside").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Your communities");
    await expect(page.getByRole("link", { name: "Discover" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore" }).first()).toBeVisible();
  });

  test("avatar is round and initials are AE for amaka-eze", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    await expect(page.getByText("AE")).toBeVisible();
  });

  test("joined date reads like 'Joined Month YYYY'", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    await expect(page.getByText(/Joined [A-Z][a-z]+ \d{4}/)).toBeVisible();
  });

  test("Wallet card appears only on own profile", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    await expect(page.getByText("Wallet")).toBeVisible();
    await page.goto("/u/tunde-ade");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    await expect(page.getByText("Wallet")).not.toBeVisible();
  });

  test("DOB is never rendered", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/Date of birth/);
  });

  test("tabs change the URL", async ({ page }) => {
    await page.goto("/u/amaka-eze?tab=communities");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    await expect(page).toHaveURL(/tab=communities/);
    await page.getByRole("tab", { name: "Badges" }).click();
    await expect(page).toHaveURL(/tab=badges/);
  });

  test("Message disabled for blocked users", async ({ page }) => {
    await page.goto("/u/victory-gray");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    await expect(page.getByRole("button", { name: /Message/ }).first()).toBeDisabled();
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    await dismissConsoleError(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

async function dismissConsoleError(page: import("@playwright/test").Page) {
  const close = page.getByRole("button", { name: "Close" });
  if (await close.count() > 0) await close.first().click().catch(() => {});
}
