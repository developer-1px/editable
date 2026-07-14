import { defineConfig, devices } from "@playwright/test";

const serverPort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65_535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535.");
}
const serverURL = `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "test-results/browser",
  reporter: [["list"]],
  testDir: "./tests/browser",
  timeout: 30_000,
  use: {
    baseURL: serverURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite dev --host 127.0.0.1 --port ${serverPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: serverURL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
