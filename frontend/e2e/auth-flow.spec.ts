import { expect, test, type Page } from "@playwright/test";

async function requestCode(page: Page, path: "/login" | "/signup", email: string) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: /Verify and (log in|continue)/ })).toBeVisible();
}

async function enterValidCode(page: Page) {
  const digits = page.locator('input[inputmode="numeric"]');
  for (let index = 0; index < 6; index++) await digits.nth(index).fill(String(index + 1));
}

async function submitProfile(page: Page, username: string) {
  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await expect(page.getByText(`#${username} is available`)).toBeVisible({ timeout: 5000 });
  await page.getByLabel("School").fill("FUT");
  await page.getByRole("option", { name: "FUT Minna" }).click();
  await page.getByLabel("Date of birth").fill("2002-05-10");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/home/);
}

test("existing login goes directly home without rendering setup", async ({ page }) => {
  const visited: string[] = [];
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname); });
  await requestCode(page, "/login", "amaka@example.com");
  await enterValidCode(page);
  await expect(page).toHaveURL(/\/home/);
  expect(visited).not.toContain("/signup/setup");
  await expect(page.getByText("Set up your profile")).toHaveCount(0);
});

test("invalid verification codes show the backend-compatible error", async ({ page }) => {
  await requestCode(page, "/login", "invalid-code@example.com");
  const digits = page.locator('input[inputmode="numeric"]');
  for (let index = 0; index < 6; index++) await digits.nth(index).fill("0");
  await expect(page.locator('p[role="alert"]')).toHaveText("That code is wrong or expired. Try again.");
});

test("login with a new email continues through the verified ticket into signup", async ({ page }) => {
  await requestCode(page, "/login", "login-new@example.com");
  await enterValidCode(page);
  await expect(page.getByRole("heading", { name: "No account for this email yet" })).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\/setup/);
  await submitProfile(page, "login-new-user");
});

test("signup account persists and logs in directly on the next visit", async ({ page }) => {
  await requestCode(page, "/signup", "signup-new@example.com");
  await enterValidCode(page);
  await submitProfile(page, "signup-new-user");
  await page.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await requestCode(page, "/login", "signup-new@example.com");
  await enterValidCode(page);
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText("Set up your profile")).toHaveCount(0);
});

test("signup with an existing email signs in with an informational toast", async ({ page }) => {
  await requestCode(page, "/signup", "amaka@example.com");
  await enterValidCode(page);
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByRole("status").filter({ hasText: "You already have an account. We signed you in." })).toBeVisible();
  await expect(page.getByText("Set up your profile")).toHaveCount(0);
});

test("setup route requires an unexpired signup ticket", async ({ page }) => {
  await page.goto("/signup/setup");
  await expect(page).toHaveURL(/\/signup\?message=start-again/);
  await expect(page.getByRole("status").filter({ hasText: "Start again to verify your email" })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("square.auth-flow.v1", JSON.stringify({
    mode: "signup", email: "expired@example.com", ticket: "expired-ticket", ticketExpiresAt: Date.now() - 1,
  })));
  await page.goto("/signup/setup");
  await expect(page).toHaveURL(/\/signup\?message=start-again/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
});

test("route guards preserve relative next paths and reject external destinations", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login\?next=%2Fhome/);
  await page.getByLabel("Email").fill("amaka@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Verify and log in" })).toBeVisible();
  await enterValidCode(page);
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/home/);
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/home/);
  await page.context().clearCookies();
  await page.goto("/login?next=https%3A%2F%2Fexample.org%2F");
  await page.getByLabel("Email").fill("amaka@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await enterValidCode(page);
  await expect(page).toHaveURL(/\/home/);
  expect(page.url()).not.toContain("example.org");
});

test("auth screens render at desktop and mobile reference sizes", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const suffix = viewport.width === 1366 ? "desktop" : "mobile";
    async function freshPage() {
      const context = await browser.newContext({ viewport });
      return { context, page: await context.newPage() };
    }
    const login = await freshPage();
    await login.page.goto("/login");
    await login.page.screenshot({ path: testInfo.outputPath(`auth-${suffix}-login.png`) });
    await login.context.close();

    const signup = await freshPage();
    await signup.page.goto("/signup");
    await signup.page.screenshot({ path: testInfo.outputPath(`auth-${suffix}-signup.png`) });
    await signup.context.close();

    const code = await freshPage();
    await requestCode(code.page, "/login", "screenshot-new@example.com");
    await code.page.screenshot({ path: testInfo.outputPath(`auth-${suffix}-code.png`) });
    await enterValidCode(code.page);
    await expect(code.page.getByRole("heading", { name: "No account for this email yet" })).toBeVisible();
    await code.page.screenshot({ path: testInfo.outputPath(`auth-${suffix}-no-account.png`) });
    await code.page.getByRole("button", { name: "Create account" }).click();
    await expect(code.page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
    await code.page.screenshot({ path: testInfo.outputPath(`auth-${suffix}-setup.png`) });
    await code.context.close();

    const toast = await freshPage();
    await requestCode(toast.page, "/signup", "amaka@example.com");
    await enterValidCode(toast.page);
    await expect(toast.page.getByRole("status").filter({ hasText: "You already have an account. We signed you in." })).toBeVisible();
    await toast.page.screenshot({ path: testInfo.outputPath(`auth-${suffix}-existing-account-toast.png`) });
    await toast.context.close();
  }
});
