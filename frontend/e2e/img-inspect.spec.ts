import { test, expect } from "@playwright/test";

test("inspect imgs + errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  const imgs = page.locator("img");
  console.log("total imgs:", await imgs.count());
  for (const im of await imgs.all()) {
    console.log("img src:", await im.getAttribute("src"), "alt:", await im.getAttribute("alt"), "class:", await im.getAttribute("class"));
  }
  // check if hero-mascot referenced anywhere in srcset or src
  const allSrcs = await page.locator("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  console.log("all srcs:", allSrcs);
  console.log("errors:", errors);
  // Check for the image in the DOM by src containing mascot
  const mascotImg = page.locator('img[src*="mascot"], img[src*="hero-mascot"]');
  console.log("mascot imgs:", await mascotImg.count());
  // Check page source for hero-mascot
  const content = await page.content();
  console.log("content has hero-mascot:", content.includes("hero-mascot"));
  console.log("content has _next/image mascot:", content.includes("hero-mascot.jpg"));
});
