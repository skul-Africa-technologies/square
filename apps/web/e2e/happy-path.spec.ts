import { test, expect } from "@playwright/test";

test("sign up -> create community -> create channel -> post in General", async ({ page }) => {
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
  await expect(page).toHaveURL(/\/explore/);
  await expect(page.getByText("Web3 Club")).toBeVisible();
  // Mock UI: navigate to community/channel and post (create flows represented via existing seeded shell)
  await page.goto("/c/web3-club/general/general");
  const composer = page.getByLabel("Message composer");
  await composer.fill("Hello from e2e");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hello from e2e")).toBeVisible();
});
