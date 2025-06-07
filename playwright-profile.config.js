const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 120000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1337',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-profile',
      use: { 
        ...devices['Desktop Chrome'],
        // Use persistent context with user data
        launchOptions: {
          args: [
            '--user-data-dir=C:\\Users\\JOY\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 1',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        }
      },
    },
    {
      name: 'chromium-clean',
      use: { 
        ...devices['Desktop Chrome'],
        // Clean browser without profile
      },
    },
  ],
}); 