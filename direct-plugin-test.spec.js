const { test, expect } = require('@playwright/test');

test.describe('Direct Smart Component Filter Plugin Test', () => {
  test('should test plugin directly on item page', async ({ page }) => {
    console.log('🚀 Starting Direct Smart Component Filter test...');
    
    // Go directly to the item page
    const itemUrl = 'http://localhost:1337/admin/content-manager/collection-types/api::item.item/f98zymeazmd6zcqhdoaruftk?plugins[i18n][locale]=en';
    await page.goto(itemUrl);
    await page.waitForLoadState('networkidle');
    
    // Check if login is needed
    const isLoginPage = await page.locator('input[name="email"]').isVisible();
    
    if (isLoginPage) {
      console.log('🔐 Logging into Strapi admin...');
      await page.fill('input[name="email"]', 'admin@ratebox.com');
      await page.fill('input[name="password"]', 'Ratebox2024!');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      console.log('✅ Login successful');
      
      // Go to item page again after login
      await page.goto(itemUrl);
      await page.waitForLoadState('networkidle');
    }
    
    console.log('✅ On Scammer A item page');
    
    // Wait for page to fully load
    await page.waitForTimeout(5000);
    
    // Take screenshot of the page
    await page.screenshot({ path: 'item-page-loaded.png', fullPage: true });
    console.log('📸 Screenshot saved as item-page-loaded.png');
    
    // Check for plugin console logs
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
      console.log('🔍 Browser console:', msg.text());
    });
    
    // Look for FieldGroup section with multiple strategies
    const fieldGroupFound = await page.locator('text=FieldGroup').isVisible();
    console.log(`📊 FieldGroup visible: ${fieldGroupFound}`);
    
    if (fieldGroupFound) {
      // Scroll to FieldGroup
      await page.locator('text=FieldGroup').scrollIntoViewIfNeeded();
      await page.waitForTimeout(2000);
      
      // Look for Add component button with multiple strategies
      const addButtonSelectors = [
        'text=Add a component to FieldGroup',
        'button:has-text("Add a component")',
        'button:has-text("Add component")',
        '[data-testid*="add-component"]',
        'button[type="button"]:has-text("Add")'
      ];
      
      let buttonFound = false;
      for (const selector of addButtonSelectors) {
        try {
          const element = page.locator(selector);
          if (await element.isVisible()) {
            console.log(`✅ Found Add Component button with: ${selector}`);
            
            // Click the button
            await element.click();
            buttonFound = true;
            console.log('✅ Clicked Add Component button');
            
            // Wait for component picker
            await page.waitForTimeout(5000);
            
            // Take screenshot of component picker
            await page.screenshot({ path: 'component-picker-opened.png', fullPage: true });
            console.log('📸 Component picker screenshot saved');
            
            // Check for API call in network logs
            const apiCalls = [];
            page.on('response', response => {
              if (response.url().includes('smart-component-filter')) {
                apiCalls.push(response.url());
                console.log('🌐 API call detected:', response.url());
              }
            });
            
            // Wait a bit more for any async operations
            await page.waitForTimeout(3000);
            
            // Check what's visible in the component picker
            const allText = await page.textContent('body');
            const hasInfo = allText.includes('info');
            const hasBank = allText.includes('Bank');
            const hasContact = allText.includes('contact');
            const hasViolation = allText.includes('violation');
            const hasUtilities = allText.includes('utilities');
            
            console.log(`📊 Page contains 'info': ${hasInfo}`);
            console.log(`📊 Page contains 'Bank': ${hasBank}`);
            console.log(`📊 Page contains 'contact': ${hasContact}`);
            console.log(`📊 Page contains 'violation': ${hasViolation}`);
            console.log(`📊 Page contains 'utilities': ${hasUtilities}`);
            
            // Check plugin effectiveness
            if (hasInfo && hasBank && !hasContact && !hasViolation && !hasUtilities) {
              console.log('🎉 SUCCESS: Smart Component Filter is working correctly!');
              console.log('✅ Only "info" category with "Bank" component is visible');
            } else if (hasContact || hasViolation || hasUtilities) {
              console.log('❌ FAILED: Plugin not filtering - unwanted categories visible');
            } else {
              console.log('❓ UNCLEAR: Need manual verification');
            }
            
            break;
          }
        } catch (e) {
          console.log(`❌ Button selector failed: ${selector} - ${e.message}`);
        }
      }
      
      if (!buttonFound) {
        console.log('❌ Could not find Add Component button');
        await page.screenshot({ path: 'fieldgroup-section.png', fullPage: true });
      }
    } else {
      console.log('❌ FieldGroup section not found');
    }
    
    // Print all console logs from browser
    console.log('🔍 All browser console logs:');
    consoleLogs.forEach(log => console.log('  -', log));
    
    console.log('🏁 Direct test completed');
  });
}); 