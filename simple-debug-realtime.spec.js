const { test, expect } = require('@playwright/test');

test.describe('Simple Debug - Find UI Elements', () => {
  test('Debug Strapi UI and find navigation elements', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      if (msg.text().includes('🔄🔄🔄') || msg.text().includes('Smart Component Filter') || msg.text().includes('REAL-TIME')) {
        console.log(`🎯 CONSOLE: ${msg.text()}`);
      }
    });

    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    
    // Login
    await page.fill('input[name="email"]', 'admin@strapi.io');
    await page.fill('input[name="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await page.waitForTimeout(3000);
    console.log('✅ Logged in successfully');

    // Take screenshot of dashboard
    await page.screenshot({ path: 'debug-dashboard-ui.png' });
    console.log('📸 Screenshot saved: debug-dashboard-ui.png');

    // List all visible text elements
    const allText = await page.locator('text=*').allTextContents();
    console.log('🔍 All visible text elements:');
    allText.slice(0, 20).forEach((text, index) => {
      if (text.trim()) {
        console.log(`  ${index + 1}: "${text.trim()}"`);
      }
    });

    // Look for navigation links
    const navLinks = await page.locator('nav a, [role="navigation"] a, [data-testid*="link"]').allTextContents();
    console.log('🔍 Navigation links found:');
    navLinks.forEach((link, index) => {
      if (link.trim()) {
        console.log(`  Nav ${index + 1}: "${link.trim()}"`);
      }
    });

    // Try to find Content Manager or similar
    const contentManagerSelectors = [
      'text=Content Manager',
      'text=Content-Manager', 
      'text=Quản lý nội dung',
      '[data-testid="content-manager"]',
      '[data-testid="content-manager-link"]',
      'a[href*="content-manager"]',
      'text=Collection Types',
      'text=Single Types'
    ];

    for (const selector of contentManagerSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`✅ Found Content Manager with selector: ${selector}`);
          await element.click();
          await page.waitForTimeout(2000);
          break;
        }
      } catch (e) {
        console.log(`❌ Selector not found: ${selector}`);
      }
    }

    // Take screenshot after navigation attempt
    await page.screenshot({ path: 'debug-after-navigation.png' });
    console.log('📸 Screenshot saved: debug-after-navigation.png');

    // Look for Item collection
    const itemSelectors = [
      'text=Item',
      'text=Items', 
      '[data-testid*="item"]',
      'a[href*="item"]'
    ];

    for (const selector of itemSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`✅ Found Item collection with selector: ${selector}`);
          await element.click();
          await page.waitForTimeout(2000);
          break;
        }
      } catch (e) {
        console.log(`❌ Item selector not found: ${selector}`);
      }
    }

    // Final screenshot
    await page.screenshot({ path: 'debug-final-state.png' });
    console.log('📸 Final screenshot saved: debug-final-state.png');

    await page.waitForTimeout(5000); // Keep page open for inspection
  });
}); 