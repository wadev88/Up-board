import { defineConfig, devices } from "@playwright/test";

/**
 * Full-stack E2E against a REAL running stack (no mocks): Next.js → FastAPI → PostgreSQL.
 *
 *   docker compose -p upboard up -d --build          # from the repo root
 *   E2E_DEMO_PASSWORD=... E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
 *   npx playwright test -c playwright.real.config.ts
 *
 * The specs create their own data with unique titles, so they can run repeatedly.
 */
export default defineConfig({
  testDir: "./e2e-real",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chromium" }, grep: /@mobile/ },
  ],
});
