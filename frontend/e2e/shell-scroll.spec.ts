import { test, expect } from "@playwright/test";

const ROUTES = [
  "/home",
  "/explore",
  "/dm",
  "/dm/dm1",
  "/c/web3-club/general",
  "/u/amaka-eze",
  "/settings",
];

const VIEWPORTS = [
  { width: 1920, height: 1080, label: "1920x1080" },
  { width: 1366, height: 768, label: "1366x768" },
  { width: 1366, height: 600, label: "1366x600" },
  { width: 1092, height: 614, label: "1092x614 (125% zoom)" },
  { width: 910, height: 512, label: "910x512 (150% zoom)" },
  { width: 390, height: 844, label: "390x844 mobile" },
];

test.describe("app shell never scrolls the page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
  });

  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      test(`route ${route} at ${vp.label}: no page scroll, left panel pinned to bottom`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route);
        await page.waitForLoadState("networkidle");

        const scrollHeight = await page.evaluate(() => document.scrollingElement!.scrollHeight);
        const innerHeight = await page.evaluate(() => window.innerHeight);
        expect(scrollHeight).toBeLessThanOrEqual(innerHeight);

        if (vp.width >= 768) {
          const leftPanel = page.locator(".left-panel-fixed, aside").first();
          await expect(leftPanel).toBeVisible();
          const box = await leftPanel.boundingBox();
          expect(box).not.toBeNull();
          const panelBottom = box ? box.y + box.height : 0;
          expect(Math.round(panelBottom)).toBeGreaterThanOrEqual(Math.round(innerHeight - 1));
        }
      });
    }
  }
});
