import { test, expect } from "@playwright/test";

const ROUTES = [
  "/home",
  "/dm/dm1",
  "/u/amaka-eze",
  "/explore",
];

const VIEWPORTS = [
  { width: 1366, height: 768, label: "1366x768" },
  { width: 1920, height: 1080, label: "1920x1080" },
  { width: 2560, height: 1440, label: "2560x1440" },
  { width: 1100, height: 700, label: "1100x700" },
  { width: 390, height: 844, label: "390x844 mobile" },
];

test.describe("shell fills viewport, no right gap, no scrollbars", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
  });

  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      test(`${route} at ${vp.label}: shell fills width, no right gap, no scrollbar`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route);
        await page.waitForLoadState("networkidle");

        const shell = page.locator(".shell-grid:visible, .mobile-shell:visible").first();
        await expect(shell).toBeVisible();

        const shellBox = await shell.boundingBox();
        expect(shellBox).not.toBeNull();
        // Shell fills the viewport width (allow 1px subpixel tolerance); no empty column on the right.
        expect(Math.round(shellBox!.width)).toBeGreaterThanOrEqual(vp.width - 1);

        // No horizontal overflow / empty column: document scroll width equals client width
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBe(clientWidth);
      });
    }
  }
});

test("scroll regions keep scrolling (overflow-y auto on regions that exist)", async ({ page }) => {
  await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/home");
  await page.waitForLoadState("networkidle");

  const overflowAuto = await page.evaluate(() => {
    const sel = [".main-content", ".left-panel-content", ".strip-icons", ".mobile-sheet-content"];
    const results: boolean[] = [];
    for (const s of sel) {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el) continue;
      const ov = getComputedStyle(el).overflowY;
      if (ov === "auto" || ov === "overlay" || ov === "scroll") results.push(true);
    }
    return results.length > 0 && results.every(Boolean);
  });
  expect(overflowAuto).toBe(true);

  // No scrollbar takes layout space on regions that exist
  const noBar = await page.evaluate(() => {
    const sel = [".main-content", ".left-panel-content", ".strip-icons", ".mobile-sheet-content"];
    const results: boolean[] = [];
    for (const s of sel) {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el) continue;
      results.push(el.offsetWidth === el.clientWidth);
    }
    return results.length > 0 && results.every(Boolean);
  });
  expect(noBar).toBe(true);
});
