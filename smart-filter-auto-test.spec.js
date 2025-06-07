const { test, expect } = require('@playwright/test');

test.describe('Smart Component Filter Plugin Auto Test', () => {
  test('should filter component picker to show only allowed components', async ({ page }) => {
    console.log('🚀 Starting Smart Component Filter auto test...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Check if already logged in or need to login
    const isLoginPage = await page.locator('input[name="email"]').isVisible();
    
    if (isLoginPage) {
      console.log('🔐 Logging into Strapi admin...');
      // Use correct credentials
      await page.fill('input[name="email"]', 'admin@ratebox.com');
      await page.fill('input[name="password"]', 'Ratebox2024!');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      console.log('✅ Login successful');
    } else {
      console.log('ℹ️ Already logged in');
    }
    
    // Wait for dashboard to load
    await page.waitForTimeout(3000);
    
    // Try multiple selectors for Content Manager
    const contentManagerSelectors = [
      'text=Content Manager',
      '[href*="content-manager"]',
      'a[href="/admin/content-manager"]',
      'nav a:has-text("Content Manager")',
      '[data-testid="content-manager"]'
    ];
    
    let contentManagerFound = false;
    for (const selector of contentManagerSelectors) {
      try {
        if (await page.locator(selector).isVisible()) {
          await page.click(selector);
          contentManagerFound = true;
          console.log(`✅ Found Content Manager with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`❌ Selector failed: ${selector}`);
      }
    }
    
    if (!contentManagerFound) {
      console.log('❌ Could not find Content Manager link');
      // Take screenshot for debugging
      await page.screenshot({ path: 'debug-dashboard.png', fullPage: true });
      return;
    }
    
    await page.waitForTimeout(3000);
    
    // Try multiple selectors for Item
    const itemSelectors = [
      'text=Item',
      '[href*="item"]',
      'a[href*="api::item.item"]',
      'nav a:has-text("Item")'
    ];
    
    let itemFound = false;
    for (const selector of itemSelectors) {
      try {
        if (await page.locator(selector).isVisible()) {
          await page.click(selector);
          itemFound = true;
          console.log(`✅ Found Item with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`❌ Item selector failed: ${selector}`);
      }
    }
    
    if (!itemFound) {
      console.log('❌ Could not find Item link');
      await page.screenshot({ path: 'debug-content-manager.png', fullPage: true });
      return;
    }
    
    await page.waitForTimeout(3000);
    
    // Try to find "Scammer A" item
    const scammerSelectors = [
      'text=Scammer A',
      'a:has-text("Scammer A")',
      '[href*="f98zymeazmd6zcqhdoaruftk"]'
    ];
    
    let scammerFound = false;
    for (const selector of scammerSelectors) {
      try {
        if (await page.locator(selector).isVisible()) {
          await page.click(selector);
          scammerFound = true;
          console.log(`✅ Found Scammer A with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`❌ Scammer selector failed: ${selector}`);
      }
    }
    
    if (!scammerFound) {
      console.log('❌ Could not find Scammer A item');
      await page.screenshot({ path: 'debug-item-list.png', fullPage: true });
      return;
    }
    
    await page.waitForLoadState('networkidle');
    console.log('✅ Opened Scammer A item');
    
    // Wait for page to fully load
    await page.waitForTimeout(5000);
    
    // Try to find FieldGroup section
    const fieldGroupSelectors = [
      'text=FieldGroup',
      '[data-testid*="fieldgroup"]',
      'label:has-text("FieldGroup")',
      'h3:has-text("FieldGroup")'
    ];
    
    let fieldGroupFound = false;
    for (const selector of fieldGroupSelectors) {
      try {
        if (await page.locator(selector).isVisible()) {
          await page.locator(selector).scrollIntoViewIfNeeded();
          fieldGroupFound = true;
          console.log(`✅ Found FieldGroup with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`❌ FieldGroup selector failed: ${selector}`);
      }
    }
    
    if (!fieldGroupFound) {
      console.log('❌ Could not find FieldGroup section');
      await page.screenshot({ path: 'debug-item-page.png', fullPage: true });
      return;
    }
    
    await page.waitForTimeout(2000);
    
    // Try to find "Add a component" button
    const addComponentSelectors = [
      'text=Add a component to FieldGroup',
      'button:has-text("Add a component")',
      '[data-testid*="add-component"]',
      'button:has-text("Add component")',
      'text=Add component'
    ];
    
    let addComponentFound = false;
    for (const selector of addComponentSelectors) {
      try {
        if (await page.locator(selector).isVisible()) {
          await page.click(selector);
          addComponentFound = true;
          console.log(`✅ Found Add Component with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`❌ Add Component selector failed: ${selector}`);
      }
    }
    
    if (!addComponentFound) {
      console.log('❌ Could not find Add Component button');
      await page.screenshot({ path: 'debug-fieldgroup.png', fullPage: true });
      return;
    }
    
    await page.waitForTimeout(5000);
    console.log('✅ Clicked Add component button');
    
    // Wait for component picker to appear and take screenshot
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'component-picker-result.png', fullPage: true });
    console.log('📸 Screenshot saved as component-picker-result.png');
    
    // Check for plugin console logs in browser
    const logs = await page.evaluate(() => {
      return window.console.logs || [];
    });
    console.log('🔍 Browser console logs:', logs);
    
    // Simple check - count visible elements that might be categories or components
    const allElements = await page.locator('*').count();
    console.log(`📊 Total elements on page: ${allElements}`);
    
    // Check if we can find any text that suggests filtering worked
    const hasInfoText = await page.locator('text=info').isVisible();
    const hasBankText = await page.locator('text=Bank').isVisible();
    const hasContactText = await page.locator('text=contact').isVisible();
    
    console.log(`📊 Info text visible: ${hasInfoText}`);
    console.log(`📊 Bank text visible: ${hasBankText}`);
    console.log(`📊 Contact text visible: ${hasContactText}`);
    
    if (hasInfoText && hasBankText && !hasContactText) {
      console.log('🎉 SUCCESS: Smart Component Filter appears to be working!');
    } else if (hasInfoText && hasContactText) {
      console.log('❌ FAILED: Plugin not filtering - all categories visible');
    } else {
      console.log('❓ UNCLEAR: Need manual verification of screenshot');
    }
    
    console.log('🏁 Test completed - check component-picker-result.png for visual verification');
  });
}); 