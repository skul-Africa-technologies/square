import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3100", headless: true },
  webServer: { command: "npm run test:e2e", url: "http://localhost:3100", reuseExistingServer: false, timeout: 120000 },
});
