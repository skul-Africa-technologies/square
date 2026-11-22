import { expect, test } from "@playwright/test";

async function signInAsSeedUser(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("amaka@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  const code = page.locator('input[inputmode="numeric"]');
  for (let index = 0; index < 6; index++) await code.nth(index).fill(String(index + 1));
  await expect(page).toHaveURL(/\/home/);
}

test("shared unread badges show count, mention-only, and mixed states", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await signInAsSeedUser(page);
  await page.goto("/dm");
  await expect(page.locator('[data-testid="unread-badge"][data-state="count"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="unread-badge"][data-state="mentions"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="unread-badge"][data-state="mixed"]').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mentions-dm-badge-states.png") });
  await page.goto("/c/web3-club");
  await expect(page.locator('[data-testid="unread-badge"][data-state="count"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="unread-badge"][data-state="mentions"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="unread-badge"][data-state="mixed"]').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mentions-assets-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("mentions-assets-mobile.png") });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dm/dm1");
  await expect(page.getByTestId("mention-jump")).toHaveAttribute("aria-label", "Jump to your mention");
  await page.screenshot({ path: testInfo.outputPath("mentions-chat-jump-one-desktop.png") });
});

test("asset chat jumps to an off-screen mention and opens a paginated picker at @", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAsSeedUser(page);
  await page.goto("/c/web3-club/general");

  const mentionedMessage = page.locator("#msg-p14");
  await expect(mentionedMessage).toBeAttached();
  await expect(page.getByTestId("mention-jump")).toBeVisible();
  expect(await mentionedMessage.getAttribute("class")).not.toContain("bg-blue-soft");
  await page.screenshot({ path: testInfo.outputPath("mentions-chat-jump-desktop.png") });

  await page.getByTestId("mention-jump").click();
  await expect(mentionedMessage).toBeInViewport();
  await expect(mentionedMessage).toHaveClass(/outline/);
  await page.screenshot({ path: testInfo.outputPath("mentions-flash-desktop.png") });
  await expect(page.getByTestId("mention-jump")).toHaveAttribute("aria-label", "Jump to your mention");
  await page.getByTestId("mention-jump").click();
  await expect(page.locator("#msg-p-long-21")).toBeInViewport();
  await expect(page.locator("#msg-p-long-21")).toHaveClass(/outline/);
  await expect(page.getByTestId("mention-jump")).toHaveCount(0);
  await expect(page.locator("#msg-p-long-21")).not.toHaveClass(/outline/, { timeout: 2500 });

  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("@");
  const picker = page.getByRole("listbox", { name: "Mention members" });
  await expect(picker.getByRole("option")).toHaveCount(8);
  await page.screenshot({ path: testInfo.outputPath("mentions-picker-desktop.png") });

  await composer.fill("@campus-member-49");
  await expect(picker.getByRole("option").filter({ hasText: "#campus-member-490" })).toBeVisible();
  await composer.fill("@");
  await expect(picker.getByRole("option").first()).not.toContainText("campus-member");
  await composer.press("Enter");
  await expect(composer).toHaveValue(/^@[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F-]+ $/u);
  await composer.press("Backspace");
  await expect(composer).toHaveValue("");

  const fiveMentions = "@tunde-ade @kemi-obi @chioma-n @sam-okoro @david-k @";
  await composer.fill(fiveMentions);
  await expect(page.getByText("You can tag up to 5 people")).toBeVisible();
  await composer.press("Enter");
  await expect(composer).toHaveValue(fiveMentions);

  await page.setViewportSize({ width: 390, height: 844 });
  await composer.fill("@");
  await expect(picker.getByRole("option")).toHaveCount(8);
  await page.screenshot({ path: testInfo.outputPath("mentions-picker-mobile.png") });
});
