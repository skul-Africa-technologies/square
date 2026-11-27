import { test, expect } from "@playwright/test";

// Regression: the mobile sheet must always render with real content and a
// non-collapsed height. Previously a `flex-direction: column` on .mobile-shell
// stacked the 100dvh strip above the sheet, pushing the flex:1 sheet to y=844
// with height ~1px (clipped by overflow:hidden) so only the strip was visible.

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
];

const HUB_ROUTES = ["/home", "/explore", "/channels", "/inbox", "/settings", "/dm"];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height} hub sheet is visible and non-empty`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(vp);
      await page.context().addCookies([
        { name: "sq_session", value: "test", url: process.env.PW_BASE || "http://localhost:3100" },
      ]);
      page.on("dialog", (d) => d.dismiss().catch(() => {}));
    });

    for (const route of HUB_ROUTES) {
      test(`${route} renders a full-height sheet with content`, async ({ page }) => {
        await page.goto(route);
        await page.waitForSelector(".mobile-sheet", { timeout: 15000 });
        await page.waitForTimeout(300);

        const m = await page.evaluate(() => {
          const sheet = document.querySelector(".mobile-sheet")!;
          const content = document.querySelector(".mobile-sheet-content")!;
          const sr = sheet.getBoundingClientRect();
          return {
            sheetW: Math.round(sr.width),
            sheetH: Math.round(sr.height),
            textLen: (content.textContent || "").trim().length,
            vw: window.innerWidth,
          };
        });

        // Sheet must fill the area right of the 72px strip and be tall enough.
        expect(m.sheetH).toBeGreaterThan(200);
        expect(m.sheetW).toBeGreaterThanOrEqual(m.vw - 72 - 2);
        expect(m.sheetW).toBeLessThanOrEqual(m.vw - 72 + 2);
        // Content must be present (fails on the empty-sheet regression).
        expect(m.textLen).toBeGreaterThan(0);
      });
    }
  });
}

// Room routes: strip is off-canvas, sheet uses full width.
test.describe("room route full-width sheet", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addCookies([
      { name: "sq_session", value: "test", url: process.env.PW_BASE || "http://localhost:3100" },
    ]);
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
  });

  for (const route of ["/dm/conv1", "/c/web3-club/general"]) {
    test(`${route} sheet spans full width`, async ({ page }) => {
      await page.goto(route);
      await page.waitForSelector(".mobile-sheet", { timeout: 15000 });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const r = document.querySelector(".mobile-sheet")!.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth };
      });
      expect(m.h).toBeGreaterThan(200);
      expect(m.w).toBeGreaterThanOrEqual(m.vw - 2);
    });
  }
});