const { test, expect } = require('@playwright/test');

test.describe('Final Real-time Debug', () => {
  test('Test real-time filtering with direct URL navigation', async ({ page }) => {
    // Enable comprehensive console logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('🔄🔄🔄') || 
          text.includes('Smart Component Filter') || 
          text.includes('REAL-TIME') ||
          text.includes('ListingType') ||
          text.includes('component') ||
          text.includes('filter')) {
        console.log(`🎯 CONSOLE: ${text}`);
      }
    });

    // Navigate directly to Strapi admin
    await page.goto('http://localhost:1337/admin');
    
    // Login
    await page.fill('input[name="email"]', 'admin@strapi.io');
    await page.fill('input[name="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('✅ Logged in successfully');

    // Navigate directly to Item create page
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForTimeout(3000);
    console.log('✅ Navigated to Item create page');

    // Take screenshot of initial state
    await page.screenshot({ path: 'realtime-debug-initial.png' });

    // Step 1: Select Bank ListingType
    console.log('🔍 Step 1: Selecting Bank ListingType...');
    
    // Wait for ListingType field to be available
    await page.waitForSelector('[data-strapi-field-name="ListingType"]', { timeout: 10000 });
    
    // Click ListingType dropdown
    await page.click('[data-strapi-field-name="ListingType"] button');
    await page.waitForTimeout(1000);
    
    // Select Bank
    await page.click('text=Bank');
    await page.waitForTimeout(2000);
    console.log('✅ Bank selected');

    // Step 2: Open Dynamic Zone component picker
    console.log('🔍 Step 2: Opening Dynamic Zone component picker...');
    
    // Wait for ItemField (Dynamic Zone) to be available
    await page.waitForSelector('[data-strapi-field-name="ItemField"]', { timeout: 10000 });
    
    // Find and click the "Add a component" button
    const addComponentButton = page.locator('[data-strapi-field-name="ItemField"] button').filter({ 
      hasText: /Add a component|Add component|Thêm component|\+/ 
    }).first();
    
    await addComponentButton.click();
    await page.waitForTimeout(2000);
    
    // Check if dialog opened
    const dialog = page.locator('[role="dialog"]');
    if (await dialog.isVisible()) {
      console.log('✅ Component picker dialog opened');
      
      // Count visible components for Bank
      const bankComponents = await page.locator('[role="dialog"] [data-testid*="component-"], [role="dialog"] button[data-testid*="component-"]').count();
      console.log(`🔍 Components visible for Bank: ${bankComponents}`);
      
      // List component names
      const componentElements = await page.locator('[role="dialog"] [data-testid*="component-"], [role="dialog"] button[data-testid*="component-"]').all();
      for (let i = 0; i < componentElements.length; i++) {
        const componentName = await componentElements[i].textContent();
        console.log(`  - Bank Component ${i + 1}: ${componentName?.trim()}`);
      }

      // Step 3: Change ListingType to Scammer while dialog is open
      console.log('🔍 Step 3: Changing ListingType to Scammer while dialog is open...');
      
      // Click ListingType dropdown (should be accessible even with dialog open)
      await page.click('[data-strapi-field-name="ListingType"] button');
      await page.waitForTimeout(500);
      
      // Select Scammer
      await page.click('text=Scammer');
      await page.waitForTimeout(3000); // Wait longer for real-time filtering
      
      console.log('✅ Changed to Scammer - checking if components updated in real-time...');
      
      // Check if components updated
      const scammerComponents = await page.locator('[role="dialog"] [data-testid*="component-"], [role="dialog"] button[data-testid*="component-"]').count();
      console.log(`🔍 Components visible for Scammer: ${scammerComponents}`);
      
      // List updated component names
      const updatedComponentElements = await page.locator('[role="dialog"] [data-testid*="component-"], [role="dialog"] button[data-testid*="component-"]').all();
      for (let i = 0; i < updatedComponentElements.length; i++) {
        const componentName = await updatedComponentElements[i].textContent();
        console.log(`  - Scammer Component ${i + 1}: ${componentName?.trim()}`);
      }

      // Step 4: Test changing back to Bank
      console.log('🔍 Step 4: Changing back to Bank...');
      await page.click('[data-strapi-field-name="ListingType"] button');
      await page.waitForTimeout(500);
      await page.click('text=Bank');
      await page.waitForTimeout(3000);
      
      const finalBankComponents = await page.locator('[role="dialog"] [data-testid*="component-"], [role="dialog"] button[data-testid*="component-"]').count();
      console.log(`🔍 Components after changing back to Bank: ${finalBankComponents}`);

      // Final verification
      console.log('\n🎯 REAL-TIME FILTERING ANALYSIS:');
      console.log(`Bank (initial): ${bankComponents} components`);
      console.log(`Scammer (changed): ${scammerComponents} components`);
      console.log(`Bank (final): ${finalBankComponents} components`);
      
      if (bankComponents !== scammerComponents) {
        console.log('✅ REAL-TIME FILTERING IS WORKING: Components changed when ListingType changed');
      } else {
        console.log('❌ REAL-TIME FILTERING NOT WORKING: Components did not change');
      }

      // Take final screenshot
      await page.screenshot({ path: 'realtime-debug-final.png' });
      
      // Close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      // Step 5: Test close/reopen behavior
      console.log('🔍 Step 5: Testing close/reopen behavior...');
      await addComponentButton.click();
      await page.waitForTimeout(2000);
      
      const reopenedComponents = await page.locator('[role="dialog"] [data-testid*="component-"], [role="dialog"] button[data-testid*="component-"]').count();
      console.log(`🔍 Components after close/reopen: ${reopenedComponents}`);
      
    } else {
      console.log('❌ Component picker dialog did not open');
      await page.screenshot({ path: 'realtime-debug-no-dialog.png' });
    }

    await page.waitForTimeout(5000); // Keep page open for inspection
  });
}); 