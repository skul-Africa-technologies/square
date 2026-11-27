import { defineConfig } from "@playwright/test";

// Real-mode server (mock disabled) pointed at a backend that never responds,
// with a short request timeout so the error/Retry path is reached quickly.
const port = process.env.PLAYWRIGHT_REAL_PORT || "3101";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "hanging-api.spec.ts",
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
  webServer: {
    command: `NEXT_PUBLIC_USE_MOCK=false NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/v1 NEXT_PUBLIC_REQUEST_TIMEOUT_MS=2000 NEXT_DIST_DIR=.next-real ./node_modules/.bin/next dev -p ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});