import { defineConfig, devices } from '@playwright/test';

// The RATE_ITEM_MODEL=nullable_variant run (DOS/Rate#1159): started by
// `scripts/e2e/run.mjs --item-model`, which applies the DOS-Me M0 + M1+M2
// proposals and apps/web/e2e/item-model/seed.sql on the throwaway database.
// Only the specs in this folder run here; the default run ignores them.
export default defineConfig({
  testDir: '.',
  outputDir: '../../../../test-results/e2e-item-model',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['github'],
        [
          'html',
          {
            open: 'never',
            outputFolder: '../../../../playwright-report-item-model',
          },
        ],
      ]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
