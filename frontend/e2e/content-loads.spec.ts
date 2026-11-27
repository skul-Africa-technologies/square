import { test, expect } from "@playwright/test";

// Mock mode: every key screen must show real content quickly, with no skeleton
// remaining after 3s, the DM list not stuck on "Loading…", and a resolved user.

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

const ROUTES = ["/home", "/dm", "/dm/dm1", "/c/web3-club", "/c/web3-club/general"];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height} content loads`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(vp);
      await page.context().addCookies([
        { name: "sq_session", value: "test", url: process.env.PW_BASE || "http://localhost:3100" },
      ]);
      page.on("dialog", (d) => d.dismiss().catch(() => {}));
    });

    for (const route of ROUTES) {
      test(`${route} shows content, no skeleton after 3s`, async ({ page }) => {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        const state = await page.evaluate(() => ({
          textLen: document.body.innerText.trim().length,
          skeletons: document.querySelectorAll('[class*="skeleton"], .animate-pulse').length,
          loading: /loading…/i.test(document.body.innerText),
          userDots: (document.body.innerText.match(/^\s*…\s*$/m) || []).length,
        }));

        expect(state.textLen).toBeGreaterThan(150);
        expect(state.skeletons).toBe(0);
        expect(state.loading).toBe(false);
        // user bar resolved (no lone "…" placeholder left)
        expect(state.userDots).toBe(0);
      });
    }
  });
}