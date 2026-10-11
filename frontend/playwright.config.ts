import { defineConfig, devices } from "@playwright/test";

/**
 * E2E specs mock every backend call with `page.route`, so no FastAPI server is
 * needed. Install browsers once with `npx playwright install chromium`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
  },
  projects: [
    // channel "chromium" = full Chromium in new headless mode (no separate headless-shell download)
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], channel: "chromium" } },
  ],
  // Production build by default: dev-mode on-demand compilation makes navigation timing flaky.
  // Set E2E_DEV=1 to iterate quickly against `next dev`.
  webServer: {
    command: process.env.E2E_DEV
      ? `npm run dev -- --port ${PORT}`
      : `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI && !!process.env.E2E_DEV,
    timeout: 180_000,
    env: { NEXT_PUBLIC_API_URL: API_URL },
  },
});
