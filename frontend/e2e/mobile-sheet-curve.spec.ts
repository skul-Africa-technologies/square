import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const screens = [
  { name: "home", path: "/home" },
  { name: "community-assets", path: "/c/design-lab" },
  { name: "asset-page", path: "/c/design-lab/general" },
  { name: "profile", path: "/u/amaka-eze" },
  { name: "messages", path: "/dm" },
  { name: "explore", path: "/explore" },
  { name: "settings", path: "/settings" },
  { name: "edit-profile", path: "/settings/profile" },
];
const viewports = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
];

async function sampleScreenshot(page: import("@playwright/test").Page, screenshot: Buffer) {
  return page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not decode mobile sheet screenshot."));
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not read mobile sheet screenshot pixels.");
    context.drawImage(image, 0, 0);
    return [[3, 3], [72, 72]].map(([x, y]) =>
      Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3),
    );
  }, `data:image/png;base64,${screenshot.toString("base64")}`);
}

test("mobile sheets keep the curved corner across app screens at 3x DPR", async ({ browser }) => {
  const screenshotDir = join(process.cwd(), "test-results", "mobile-sheet", "after");
  const beforeDir = join(process.cwd(), "test-results", "mobile-sheet", "before");
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(beforeDir, { recursive: true });

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      baseURL: "http://localhost:3100",
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.request.post("/api/session");

    for (const screen of screens) {
      await page.goto(screen.path);
      const sheet = page.getByTestId("mobile-sheet");
      await expect(sheet).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(3);
      const styles = await sheet.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          radius: computed.borderTopLeftRadius,
          overflow: computed.overflow,
          borderLeft: [computed.borderLeftWidth, computed.borderLeftColor],
          borderTop: [computed.borderTopWidth, computed.borderTopColor],
        };
      });
      expect(styles).toEqual({
        radius: "24px",
        overflow: "hidden",
        borderLeft: ["1px", "rgb(56, 189, 248)"],
        borderTop: ["1px", "rgb(56, 189, 248)"],
      });
      const layoutBounds = await page.locator(".mobile-sheet-layout").evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { width: bounds.width, right: bounds.right, overflowX: getComputedStyle(element).overflowX };
      });
      expect(layoutBounds).toEqual({ width: viewport.width, right: viewport.width, overflowX: "hidden" });
      expect(await page.evaluate(() => window.scrollX)).toBe(0);

      if (["home", "community-assets", "profile", "messages"].includes(screen.name)) {
        const squareCornerStyle = await page.addStyleTag({
          content: '[data-testid="mobile-sheet"] { border-top-left-radius: 0 !important; border-left: 0 !important; border-top: 0 !important; }',
        });
        await page.screenshot({
          path: join(beforeDir, `${screen.name}-${viewport.width}.png`),
          clip: { x: 72, y: 0, width: 160, height: 160 },
          scale: "device",
        });
        await squareCornerStyle.evaluate((element) => { element.parentNode?.removeChild(element); });
        const screenshot = await page.screenshot({
          path: join(screenshotDir, `${screen.name}-${viewport.width}.png`),
          clip: { x: 72, y: 0, width: 160, height: 160 },
          scale: "device",
        });
        const [outside, ...inside] = await sampleScreenshot(page, screenshot);
        expect(outside, `${screen.name} corner outside should show strip background`).toEqual([11, 13, 11]);
        expect(inside[0], `${screen.name} inner corner should show sheet background`).toEqual([16, 20, 16]);
      }

      if (screen.name === "home") {
        await page.getByRole("button", { name: "Search", exact: true }).click();
        const searchDialog = page.getByRole("dialog", { name: "Search" });
        await expect(searchDialog).toBeVisible();
        await expect(searchDialog).toHaveCSS("border-top-left-radius", "24px");
        await expect(searchDialog).toHaveCSS("border-top-right-radius", "24px");
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: "Create a community" }).click();
        const createDialog = page.getByRole("dialog", { name: "Create a community" });
        const createForm = createDialog.locator("form").first();
        await expect(createForm).toHaveCSS("border-top-left-radius", "24px");
        await expect(createForm).toHaveCSS("border-top-right-radius", "24px");
        await createDialog.getByRole("button", { name: "Close" }).click();
      }
    }

    await context.close();
  }
});
