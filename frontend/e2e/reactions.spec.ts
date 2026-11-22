import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/session");
  expect(response.ok()).toBeTruthy();
});

test("community messages and replies expose a working lazy reaction picker", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/c/web3-club/general");

  const messages = page.getByTestId("message-row");
  await expect(messages.first()).toBeVisible();
  for (const message of await messages.all()) {
    if (await message.getByText("Message deleted", { exact: true }).count()) continue;
    await expect(message.getByRole("button", { name: "Add reaction" })).toBeVisible();
  }

  const firstMessage = messages.first();
  const addButton = firstMessage.getByRole("button", { name: "Add reaction" });
  await addButton.click();
  const picker = page.getByTestId("reaction-picker");
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("searchbox", { name: "Search emoji" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(addButton).toBeFocused();

  await addButton.click();
  await page.getByRole("button", { name: "🔥 Quick reaction" }).click();
  await expect(firstMessage.getByRole("button", { name: "🔥 1 reaction, you reacted" })).toBeVisible();
  await firstMessage.getByRole("button", { name: "🔥 1 reaction, you reacted" }).click();
  await expect(firstMessage.getByRole("button", { name: /🔥/ })).toHaveCount(0);
});

test("the 21st distinct reaction is rejected without adding a chip", async ({ page }) => {
  await page.goto("/c/web3-club/general");
  const limitMessage = page.getByTestId("message-row").filter({ hasText: "Huge thanks to" });
  await expect(limitMessage.getByRole("button", { name: /🎯 1 reaction/ })).toBeVisible();
  await limitMessage.getByRole("button", { name: "Add reaction" }).click();
  const picker = page.getByTestId("reaction-picker");
  await picker.getByRole("searchbox", { name: "Search emoji" }).fill("robot");
  await picker.getByRole("button", { name: /🤖 robot/i }).click();
  await expect(limitMessage.getByRole("status").getByText("Reaction limit reached")).toBeVisible();
  await expect(limitMessage.getByRole("button", { name: /🤖 1 reaction/ })).toHaveCount(0);
});

test("DM replies have the same reaction controls", async ({ page }) => {
  await page.goto("/dm/dm1");
  const messages = page.getByTestId("message-row");
  await expect(messages.first()).toBeVisible();
  for (const message of await messages.all()) {
    if (await message.getByText("Message deleted", { exact: true }).count()) continue;
    await expect(message.getByRole("button", { name: "Add reaction" })).toBeVisible();
  }
});

test("mobile reaction picker opens as a bottom sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/web3-club/general");
  const addButton = page.getByTestId("message-row").first().getByRole("button", { name: "Add reaction" });
  await addButton.click();
  const picker = page.getByTestId("reaction-picker");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveCSS("position", "fixed");
  const height = await picker.evaluate(element => element.getBoundingClientRect().height);
  expect(height).toBeCloseTo(844 * 0.55, 0);
  await expect(picker).toHaveCSS("border-top-left-radius", "24px");
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
});
