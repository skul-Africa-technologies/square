import { test, expect } from "@playwright/test";

test.describe("profile page verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
    page.on("dialog", d => d.dismiss().catch(() => {}));
  });

  const viewports = [
    { width: 390, height: 844, label: "390x844" },
    { width: 360, height: 740, label: "360x740" },
    { width: 1366, height: 768, label: "1366x768" },
  ];

  for (const vp of viewports) {
    test.describe(`at ${vp.label}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
      });

      test("single profile-header-card and profile-tabs on /u/amaka-eze", async ({ page }) => {
        await page.goto("/u/amaka-eze");
        await page.waitForLoadState("networkidle");

        const headerCount = await page.locator('[data-testid="profile-header-card"]').count();
        expect(headerCount).toBe(1);

        const tabsCount = await page.locator('[data-testid="profile-tabs"]').count();
        expect(tabsCount).toBe(1);

        const tabs = page.locator('[data-testid="profile-tabs"]');
        await expect(tabs).toContainText("Communities");
        await expect(tabs).toContainText("Badges");
        await expect(tabs).toContainText("Projects");
      });

      test("page header text is #amaka-eze, no 'Asset' text", async ({ page }) => {
        await page.goto("/u/amaka-eze");
        await page.waitForLoadState("networkidle");

        const bodyText = await page.locator("body").innerText();
        expect(bodyText).toContain("#amaka-eze");
        expect(bodyText).not.toContain("Asset");
      });

      test("stats grid uses 2-column layout on mobile", async ({ page }) => {
        await page.goto("/u/amaka-eze");
        await page.waitForLoadState("networkidle");

        if (vp.width < 768) {
          const statCells = page.locator('[data-testid="profile-header-card"] .grid > div');
          const count = await statCells.count();
          expect(count).toBeGreaterThanOrEqual(4);

          // Check two distinct x positions (2-column grid)
          const elements = await statCells.all();
          const boxes = [];
          for (const el of elements) {
            const b = await el.boundingBox();
            if (b) boxes.push(b);
          }
          const xPositions = boxes.map(b => Math.round(b.x));
          const uniqueX = [...new Set(xPositions)];
          expect(uniqueX.length).toBeGreaterThanOrEqual(2);
        }
      });

      test("avatar/header card fully inside viewport on mobile", async ({ page }) => {
        await page.goto("/u/amaka-eze");
        await page.waitForLoadState("networkidle");

        if (vp.width < 768) {
          const headerCard = page.locator('[data-testid="profile-header-card"]').first();
          await expect(headerCard).toBeVisible();
          const box = await headerCard.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.width).toBeGreaterThan(0);
          expect(box!.height).toBeGreaterThan(0);
          // Header card fully inside viewport (allow 4px subpixel/safe-area tolerance)
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 4);
          expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 4);
        }
      });
    });
  }
});
