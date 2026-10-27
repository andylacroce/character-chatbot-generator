import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Optional override for sandboxes whose preinstalled Chromium lags the Playwright version
// (set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH). Unset in CI, where Playwright installs its own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const launchOptions = executablePath ? { executablePath } : {};

/**
 * Smoke synthetics against a production build (`npm run build` first).
 * The server gets a dummy Anthropic key on purpose: these tests must never spend real tokens.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  projects: [
    // Desktop runs everything; the phone project re-runs the flows and layout checks at 412px.
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    {
      name: "mobile",
      testMatch: /(flows|layout)\.spec\.ts/,
      use: { ...devices["Pixel 7"], launchOptions },
    },
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/random-character`,
    reuseExistingServer: !process.env.CI,
    env: { ANTHROPIC_API_KEY: "e2e-dummy-key-never-calls-claude", API_SECRET: "e2e-dummy-secret" },
  },
});
