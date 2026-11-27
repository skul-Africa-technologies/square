import { test, expect } from "@playwright/test";
import http from "node:http";

// Simulates a hanging API: the backend accepts connections but never responds,
// so the client's 10s (here 2s) timeout must fire and surface an error state
// with a Retry button instead of an endless skeleton.

let hanging: http.Server;

test.beforeAll(async () => {
  hanging = http.createServer(() => {
    /* never respond */
  });
  await new Promise<void>((resolve) => hanging.listen(4000, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => hanging.close(() => resolve()));
});

test("hanging API shows an error with Retry within the timeout", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.context().addCookies([
    { name: "sq_session", value: "test", url: "http://127.0.0.1:3101" },
  ]);

  await page.goto("/home", { waitUntil: "domcontentloaded" });

  // Within the timeout window the app must show a recoverable error, never a
  // permanent skeleton. Either the Retry affordance or the unreachable banner.
  const retry = page.getByRole("button", { name: "Retry" }).first();
  const banner = page.getByText(/Cannot reach the server/i).first();

  await expect
    .poll(async () => (await retry.isVisible().catch(() => false)) || (await banner.isVisible().catch(() => false)), {
      timeout: 8000,
      intervals: [200],
    })
    .toBe(true);

  // No endless loading skeleton should remain.
  await expect(page.getByText(/Loading…/i)).toHaveCount(0);
});