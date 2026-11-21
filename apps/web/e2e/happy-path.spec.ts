import { test, expect } from "@playwright/test";

test("sign up -> create community -> post in General", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@school.edu").fill("newuser@futminna.edu.ng");
  await page.getByRole("button", { name: "Send code" }).click();
  const inputs = page.locator('input[inputmode="numeric"]');
  for (let i = 0; i < 6; i++) await inputs.nth(i).fill(String((i+1)%10));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("Set up your profile")).toBeVisible();
  await page.getByLabel("Username").fill("new-builder");
  await page.getByLabel("School").fill("FUT");
  await page.getByText("FUT Minna").click();
  await page.getByLabel("Date of birth").fill("2002-05-10");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText("Web3 Club")).toBeVisible();
  await page.goto("/c/web3-club/general");
  const composer = page.getByLabel("Message composer");
  await composer.fill("Hello from e2e");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hello from e2e")).toBeVisible();
});

test("discover dashboard sections load independently", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expect(page.getByText("Good")).toBeVisible(); // greeting
  await expect(page.getByText("Top communities to join")).toBeVisible();
  await expect(page.getByText("People you may know")).toBeVisible();
  await expect(page.getByText("Celebrating today")).toBeVisible();
  await expect(page.getByText("Upcoming events")).toBeVisible();
  await expect(page.getByText("New from your school")).toBeVisible();
  await expect(page.getByText("Based on your interests")).toBeVisible();
});

test("usernames never show double hash", async ({ page }) => {
  await page.goto("/home");
  // Check visible text only, not Next.js internals
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(/##/);
});

test("avatar initials derived from username parts", async ({ page }) => {
  await page.goto("/home");
  // Check that initials for amaka-eze are AE
  // The initials appear in the user panel and in person cards
  const initials = page.locator("text=AE").first();
  await expect(initials).toBeVisible();
});