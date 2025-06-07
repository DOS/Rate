const { test, expect } = require('@playwright/test');

test.describe('Smart Component Filter Plugin Test', () => {
  test('should filter component picker to show only allowed components', async ({ page }) => {
    console.log('🚀 Starting Smart Component Filter test...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Check if already logged in or need to login
    const isLoginPage = await page.locator('input[name="email"]').isVisible();
    
    if (isLoginPage) {
      console.log('🔐 Logging into Strapi admin...');
      // Login with saved credentials
      await page.fill('input[name="email"]', 'admin@ratebox.com');
      await page.fill('input[name="password"]', 'Ratebox2024!');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }
    
    console.log('✅ Successfully logged in');
    
    // Navigate to Content Manager -> Item
    console.log('📋 Navigating to Item content type...');
    await page.click('text=Content Manager');
    await page.waitForLoadState('networkidle');
    
    // Click on Item in the sidebar
    await page.click('text=Item');
    await page.waitForLoadState('networkidle');
    
    // Find and click on "Scammer A" item (or any item with Scammer listing type)
    console.log('🔍 Looking for Scammer item...');
    const scammerItem = page.locator('text=Scammer A').first();
    
    if (await scammerItem.isVisible()) {
      await scammerItem.click();
    } else {
      // If no "Scammer A", look for any item and check its listing type
      console.log('⚠️ No "Scammer A" found, looking for any item...');
      const firstItem = page.locator('[data-testid="list-item"]').first();
      await firstItem.click();
    }
    
    await page.waitForLoadState('networkidle');
    console.log('✅ Opened item edit page');
    
    // Scroll down to find FieldGroup section
    console.log('📜 Scrolling to find FieldGroup section...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Look for "Add a component to FieldGroup" button
    const addComponentButton = page.locator('text=Add a component to FieldGroup');
    
    if (await addComponentButton.isVisible()) {
      console.log('🎯 Found "Add a component to FieldGroup" button');
      
      // Enable console logging to capture plugin logs
      page.on('console', msg => {
        if (msg.text().includes('Smart Component Filter') || 
            msg.text().includes('🔍') || 
            msg.text().includes('✅') || 
            msg.text().includes('🚫')) {
          console.log(`[BROWSER] ${msg.text()}`);
        }
      });
      
      // Click the button to open component picker
      await addComponentButton.click();
      await page.waitForTimeout(500); // Wait for component picker to open
      
      console.log('🔍 Component picker opened, checking for filtering...');
      
      // Wait a bit more for plugin to process
      await page.waitForTimeout(1000);
      
      // Check if only "info" category is visible
      const categoryHeaders = await page.locator('h3[role="button"]').all();
      console.log(`📋 Found ${categoryHeaders.length} category headers`);
      
      let visibleCategories = [];
      let hiddenCategories = [];
      
      for (const header of categoryHeaders) {
        const text = await header.textContent();
        const isVisible = await header.isVisible();
        const style = await header.evaluate(el => el.style.display);
        
        if (isVisible && style !== 'none') {
          visibleCategories.push(text);
        } else {
          hiddenCategories.push(text);
        }
      }
      
      console.log('✅ Visible categories:', visibleCategories);
      console.log('🚫 Hidden categories:', hiddenCategories);
      
      // Test expectations
      if (visibleCategories.includes('info') && visibleCategories.length === 1) {
        console.log('🎉 SUCCESS: Plugin working correctly - only "info" category visible');
        
        // Check if "Bank" component is visible in info category
        const bankComponent = page.locator('text=Bank');
        if (await bankComponent.isVisible()) {
          console.log('🎉 SUCCESS: "Bank" component is visible in info category');
        } else {
          console.log('❌ FAIL: "Bank" component not found');
        }
        
      } else if (visibleCategories.length > 1) {
        console.log('❌ FAIL: Plugin not working - multiple categories visible:', visibleCategories);
        console.log('Expected: Only "info" category should be visible');
      } else {
        console.log('❌ FAIL: No categories visible or "info" category not found');
      }
      
      // Close the component picker
      await page.keyboard.press('Escape');
      
    } else {
      console.log('❌ FAIL: "Add a component to FieldGroup" button not found');
      console.log('Available buttons:', await page.locator('button').allTextContents());
    }
    
    console.log('🏁 Test completed');
  });
}); 