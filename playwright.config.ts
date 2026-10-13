import { defineConfig, devices } from '@playwright/test';

// One worker, one headless browser, against the production build: keeps the
// laptop cool and tests what actually ships.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5198',
    viewport: { width: 480, height: 640 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 480, height: 640 } } }],
  webServer: {
    command: 'bun scripts/extract-assets.mjs --if-missing && bunx vite build && bunx vite preview',
    url: 'http://localhost:5198',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
