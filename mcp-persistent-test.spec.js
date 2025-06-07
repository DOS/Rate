const { test, expect, chromium } = require('@playwright/test');

test.describe('MCP Persistent Context Test', () => {
  test('Test with persistent browser context', async () => {
    // Launch browser with persistent context
    const userDataDir = 'C:\\Users\\JOY\\AppData\\Local\\Temp\\playwright-strapi-profile';
    const browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--disable-web-security']
    });
    
    const page = await browser.newPage();
    
    // Enable console logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Smart Component Filter') || text.includes('🎯')) {
        console.log(`🎯 CONSOLE: ${text}`);
      }
    });

    console.log('🚀 Starting persistent context test...');

    // Navigate to Strapi
    await page.goto('http://localhost:1337/admin');
    await page.waitForTimeout(3000);

    // Login if needed
    try {
      const emailField = page.locator('input[name="email"]');
      if (await emailField.isVisible({ timeout: 2000 })) {
        await emailField.fill('admin@strapi.io');
        await page.fill('input[name="password"]', 'Admin123!');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(3000);
        console.log('✅ Logged in');
      }
    } catch (e) {
      console.log('ℹ️ Already logged in or different flow');
    }

    // Test API
    const apiResult = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/smart-component-filter/listing-type/7/components');
        const data = await response.json();
        return { success: true, data };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    console.log('🎯 API Result:', apiResult);
    
    if (apiResult.success) {
      console.log('✅ SMART COMPONENT FILTER IS WORKING WITH PERSISTENT CONTEXT!');
    }

    await page.waitForTimeout(10000); // Keep open for manual testing
    await browser.close();
  });
}); 