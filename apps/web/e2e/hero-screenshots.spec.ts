import { test, expect } from "@playwright/test";

test("mobile hero screenshots", async ({ page }) => {
  await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
  const viewports = [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 320, height: 640 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ];
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `/tmp/hero-${vp.width}x${vp.height}.png`, fullPage: false });
    console.log(`saved hero-${vp.width}x${vp.height}.png`);
  }
});
