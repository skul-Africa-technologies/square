import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const defaultNames = ["announcements", "guidelines", "events", "general"];
const scenarios = [
  { slug: "design-lab", role: "owner", name: "Design Lab" },
  { slug: "web3-club", role: "moderator", name: "Web3 Club" },
  { slug: "ai-circle", role: "member", name: "AI Circle" },
];

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/session");
  expect(response.ok()).toBeTruthy();
});

test("every mock community lists its four default assets", async ({ page }) => {
  for (const slug of [
    "web3-club", "design-lab", "campus-builders", "ai-circle", "robotics",
    "founders-hub", "debate-society", "photography-club", "gaming-collective",
    "music-circle", "big-community",
  ]) {
    await page.goto(`/c/${slug}/general`);
    const sidebar = page.locator(".left-panel-fixed");
    for (const name of defaultNames) {
      const row = sidebar.locator(`[data-testid="asset-row"][href$="/${name}"]`);
      await expect(row).toBeVisible();
      await expect(row.getByTestId("asset-hash")).toHaveText("#");
    }
  }
});

test("catalog categories, unread indicators, permissions, and add flow work", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/c/design-lab/general");
  const sidebar = page.locator(".left-panel-fixed");
  const communityGroup = sidebar.getByRole("group", { name: "Community assets" });
  await expect(communityGroup.locator('[data-testid="asset-row"][href$="/showcase"]')).toBeVisible();
  await expect(communityGroup.locator('[data-testid="asset-row"][href$="/feedback"]')).toBeVisible();

  await sidebar.getByRole("button", { name: "Asset options # announcements" }).click();
  const defaultMenu = sidebar.getByRole("menu", { name: "Asset actions for # announcements" });
  await expect(defaultMenu.getByRole("menuitem", { name: "Remove asset" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await sidebar.getByRole("button", { name: "Add asset to Community" }).click();
  const dialog = page.getByRole("dialog", { name: "Add an asset" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Community" })).toHaveClass(/ring-lime/);
  await expect(dialog.getByRole("searchbox", { name: "Search suggestions" })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Custom asset name" })).toHaveCount(0);
  await expect(dialog.getByText("Custom assets are not available yet.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Added" })).toHaveCount(2);

  const support = dialog.getByRole("listitem").filter({ hasText: "# support" });
  await support.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("status").getByText("# support added")).toBeVisible();
  await expect(communityGroup.locator('[data-testid="asset-row"][href$="/support"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.goto("/c/ai-circle/general");
  await expect(page.locator(".left-panel-fixed").locator('[aria-label$=" unread"]')).toHaveCount(0);
});

test("members have no add controls and all requested role states render at both sizes", async ({ page }) => {
  const screenshotDir = join(process.cwd(), "test-results", "community-assets");
  await mkdir(screenshotDir, { recursive: true });

  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    for (const scenario of scenarios) {
      await page.setViewportSize(viewport);
      await page.goto(viewport.width < 768 ? `/c/${scenario.slug}` : `/c/${scenario.slug}/general`);
      await expect(page.getByText(scenario.name, { exact: true }).first()).toBeVisible();
      for (const name of defaultNames) {
        const row = page.locator(`[data-testid="asset-row"][href$="/${name}"]`).first();
        await expect(row).toBeVisible();
        await expect(row.getByTestId("asset-hash")).toHaveText("#");
      }

      const addButtons = page.getByRole("button", { name: /^Add/ });
      if (scenario.role === "member") {
        await expect(addButtons).toHaveCount(0);
      } else {
        await expect(addButtons.first()).toBeVisible();
      }

      const filename = `${scenario.slug}-${viewport.width}x${viewport.height}`;
      await page.screenshot({ path: join(screenshotDir, `${filename}.png`) });
      if (viewport.width < 768) {
        await expect(page.getByRole("button", { name: /Asset options/ })).toHaveCount(0);
        if (scenario.role !== "member") {
          const announcements = page.getByRole("link", { name: /# announcements/ }).first();
          await announcements.dispatchEvent("touchstart");
          await page.waitForTimeout(550);
          await announcements.dispatchEvent("touchend");
          const menu = page.getByRole("menu", { name: "Asset actions for # announcements" });
          await expect(menu).toBeVisible();
          await expect(menu.getByRole("menuitem", { name: "Remove asset" })).toHaveCount(0);
          await page.keyboard.press("Escape");
          await expect(menu).toBeHidden();
        }
      }
      if (scenario.role !== "member") {
        await page.getByRole("button", { name: "Add an asset" }).click();
        const dialog = page.getByRole("dialog", { name: "Add an asset" });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Added" }).first()).toBeVisible();
        await page.screenshot({ path: join(screenshotDir, `${filename}-add.png`) });
        await page.keyboard.press("Escape");
      }
    }
  }
});

test("asset rows are flat, hash-led, and use blue read states", async ({ page }) => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    for (const scenario of scenarios) {
      await page.setViewportSize(viewport);
      await page.goto(viewport.width < 768 ? `/c/${scenario.slug}` : `/c/${scenario.slug}/general`);

      const categories = page.getByTestId("asset-category");
      await expect(categories).not.toHaveCount(0);
      for (const category of await categories.all()) {
        const style = await category.evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            border: [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth],
            background: computed.backgroundColor,
            shadow: computed.boxShadow,
          };
        });
        expect(style).toEqual({ border: ["0px", "0px", "0px", "0px"], background: "rgba(0, 0, 0, 0)", shadow: "none" });
      }

      const rows = page.getByTestId("asset-row");
      await expect(rows).not.toHaveCount(0);
      for (const row of await rows.all()) {
        await expect(row.getByTestId("asset-hash")).toHaveText("#");
        const rowStyle = await row.evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            border: [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth],
            background: computed.backgroundColor,
          };
        });
        expect(rowStyle.border).toEqual(["0px", "0px", "0px", "0px"]);
        const isSelected = viewport.width >= 768 && (await row.getAttribute("href"))?.endsWith("/general");
        expect(rowStyle.background).toBe(isSelected ? "rgba(125, 211, 252, 0.12)" : "rgba(0, 0, 0, 0)");

        const unread = await row.locator('[aria-label$=" unread"], [aria-label$=" new"]').count() > 0;
        const nameStyle = await row.getByTestId("asset-name").evaluate((element) => {
          const computed = getComputedStyle(element);
          return { color: computed.color, opacity: computed.opacity, weight: computed.fontWeight };
        });
        expect(nameStyle.color).toBe(unread || isSelected ? "rgb(56, 189, 248)" : "rgb(125, 211, 252)");
        expect(nameStyle.opacity).toBe(unread || isSelected ? "1" : "0.8");
        expect(nameStyle.weight).toBe(unread || isSelected ? "600" : "500");

        for (const icon of await row.locator("svg").all()) {
          await expect(icon).toHaveAttribute("aria-label", "Read-only");
        }
      }
    }
  }
});
