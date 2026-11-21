import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const SCREEN_DIR = path.join(process.cwd(), "playwright-screenshots");

test.describe("screenshots at 1366x768", () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREEN_DIR, { recursive: true });
  });
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
    await page.setViewportSize({ width: 1366, height: 768 });
  });

  test("/home", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(SCREEN_DIR, "1366-home.png"), fullPage: true });
  });

  test("/c/web3-club/general (community chat)", async ({ page }) => {
    await page.goto("/c/web3-club/general");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(SCREEN_DIR, "1366-community-chat.png"), fullPage: true });
  });

  test("/u/amaka-eze (profile)", async ({ page }) => {
    await page.goto("/u/amaka-eze");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(SCREEN_DIR, "1366-profile.png"), fullPage: true });
  });

  test("/explore", async ({ page }) => {
    await page.goto("/explore");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(SCREEN_DIR, "1366-explore.png"), fullPage: true });
  });
});
