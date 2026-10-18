import { defineConfig, devices } from '@playwright/test';

// Started by scripts/e2e/run.mjs, which serves the app at E2E_BASE_URL against
// a throwaway PostgREST seeded from apps/web/e2e/seed.sql.
export default defineConfig({
  testDir: '.',
  outputDir: '../../../test-results/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: '../../../playwright-report' }],
      ]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
