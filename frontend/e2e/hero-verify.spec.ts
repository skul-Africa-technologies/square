import { test, expect } from "@playwright/test";

test("mobile hero verification", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  console.log("URL:", page.url());

  const greeting = page.getByText(/Good morning|Good afternoon|Good evening/).first();
  await expect(greeting).toBeVisible();

  // Find hero card: closest ancestor of greeting that contains an img
  const heroImg = page.locator('img[src*="hero-mascot"]').first();
  console.log("heroImg count:", await heroImg.count());
  if (await heroImg.count() > 0) {
    const imgBox = await heroImg.boundingBox();
    console.log("img box:", JSON.stringify(imgBox));
    expect(imgBox!.width).toBeGreaterThan(300);
  }

  // The card: parent div with border
  const card = greeting.locator("xpath=ancestor::div[contains(@class, 'rounded-[20px]')][1]");
  const cardBox = await card.boundingBox();
  console.log("card box:", JSON.stringify(cardBox));
  if (cardBox) {
    console.log("card height:", cardBox.height);
    expect(cardBox.height).toBeLessThanOrEqual(240);
  }

  const nameEl = page.getByText("#amaka-eze").first();
  const nameBox = await nameEl.boundingBox();
  console.log("name box:", JSON.stringify(nameBox), "text:", await nameEl.textContent());
  expect(await nameEl.textContent()).toBe("#amaka-eze");

  const btns = page.locator('button:has-text("Find people"), a:has-text("Explore")');
  for (const b of await btns.all()) {
    const box = await b.boundingBox();
    console.log("button:", await b.textContent(), "h:", box?.height, "w:", box?.width);
  }

  expect(errors.length).toBe(0);
  console.log("console errors:", errors);
});
