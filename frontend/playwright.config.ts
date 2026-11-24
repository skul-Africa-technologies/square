import { defineConfig } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT || "3100";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: `http://localhost:${port}`, headless: true },
  webServer: {
    command: `PORT=${port} npm run test:e2e`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
