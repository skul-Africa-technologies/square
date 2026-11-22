import { test, expect } from "@playwright/test";

test.describe("profile page at 390x844", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
    page.on("dialog", d => d.dismiss().catch(() => {}));
  });

  test("single header card and tabs on /u/amaka-eze", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    expect(await page.locator('[data-testid="profile-header-card"]').count()).toBe(1);
    expect(await page.locator('[data-testid="profile-tabs"]').count()).toBe(1);
    const tabs = page.locator('[data-testid="profile-tabs"]');
    await expect(tabs).toContainText("Communities");
    await expect(tabs).toContainText("Badges");
    await expect(tabs).toContainText("Projects");
  });

  test("header text is #amaka-eze, no Asset text", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("#amaka-eze");
    expect(bodyText).not.toContain("Asset");
  });
});

test.describe("profile page at 360x740", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
    page.on("dialog", d => d.dismiss().catch(() => {}));
  });

  test("single header card and tabs on /u/amaka-eze", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    expect(await page.locator('[data-testid="profile-header-card"]').count()).toBe(1);
    expect(await page.locator('[data-testid="profile-tabs"]').count()).toBe(1);
    const tabs = page.locator('[data-testid="profile-tabs"]');
    await expect(tabs).toContainText("Communities");
    await expect(tabs).toContainText("Badges");
    await expect(tabs).toContainText("Projects");
  });

  test("header text is #amaka-eze, no Asset text", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("#amaka-eze");
    expect(bodyText).not.toContain("Asset");
  });
});

test.describe("profile page at 1366x768", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
    page.on("dialog", d => d.dismiss().catch(() => {}));
  });

  test("single header card and tabs on /u/amaka-eze", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    expect(await page.locator('[data-testid="profile-header-card"]').count()).toBe(1);
    expect(await page.locator('[data-testid="profile-tabs"]').count()).toBe(1);
    const tabs = page.locator('[data-testid="profile-tabs"]');
    await expect(tabs).toContainText("Communities");
    await expect(tabs).toContainText("Badges");
    await expect(tabs).toContainText("Projects");
  });

  test("header text is #amaka-eze, no Asset text", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("#amaka-eze");
    expect(bodyText).not.toContain("Asset");
  });
});
