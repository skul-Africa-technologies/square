import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const SCREEN_DIR = path.join(process.cwd(), "playwright-screenshots");

const VIEWPORTS = [
  { width: 1366, height: 768, label: "1366x768" },
  { width: 1920, height: 1080, label: "1920x1080" },
  { width: 1100, height: 700, label: "1100x700" },
  { width: 390, height: 844, label: "390x844 mobile" },
];

test.describe("screenshots for review", () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREEN_DIR, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
  });

  for (const vp of VIEWPORTS) {
    test(`/home at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/home");
      await page.waitForLoadState("networkidle");

      // scrolled to the middle of the main content
      const main = page.locator(".main-content").first();
      const scrollHeight = await main.evaluate((el) => el.scrollHeight - el.clientHeight);
      await main.evaluate((el, y) => (el.scrollTop = y), scrollHeight / 2);
      await page.waitForTimeout(300);

      await page.screenshot({
        path: path.join(SCREEN_DIR, `home-${vp.label}-middle.png`),
        fullPage: true,
      });

      // top of page (first card in each row)
      await main.evaluate((el) => (el.scrollTop = 0));
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(SCREEN_DIR, `home-${vp.label}-top.png`),
        fullPage: true,
      });
    });
  }
});
