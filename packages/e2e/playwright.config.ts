import { defineConfig } from "@playwright/test";

// End-to-end tests: a real browser against the real server (start-server.sh).
// `pnpm test:e2e` from the repository root. Browsers: `npx playwright install
// chromium` once, or PLAYWRIGHT_CHROMIUM_PATH for an installed Chromium.
const port = Number(process.env.E2E_PORT ?? 8799);

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "./start-server.sh",
    url: `http://localhost:${port}/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
