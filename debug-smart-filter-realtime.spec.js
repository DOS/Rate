const { test, expect } = require('@playwright/test');

test.describe('Smart Component Filter - Real-time Debug', () => {
  test('Debug real-time filtering when changing ListingType', async ({ page }) => {
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
    
    // Wait for dashboard - try multiple selectors
    try {
      await page.waitForSelector('[data-testid="homepage-header"]', { timeout: 5000 });
    } catch {
      try {
        await page.waitForSelector('text=Welcome', { timeout: 5000 });
      } catch {
        await page.waitForSelector('[data-testid="content-manager-link"]', { timeout: 5000 });
      }
    }
    console.log('✅ Logged in successfully');

    // Navigate to Item collection
    await page.click('text=Content Manager');
    await page.waitForTimeout(1000);
    await page.click('text=Item');
    await page.waitForTimeout(1000);
    
    // Click Create new entry
    await page.click('text=Create new entry');
    await page.waitForTimeout(2000);
    console.log('✅ Navigated to Item create page');

    // Step 1: Select Bank ListingType
    console.log('🔍 Step 1: Selecting Bank ListingType...');
    await page.click('[data-strapi-field-name="ListingType"] button');
    await page.waitForTimeout(500);
    await page.click('text=Bank');
    await page.waitForTimeout(1000);
    console.log('✅ Bank selected');

    // Step 2: Open Dynamic Zone component picker
    console.log('🔍 Step 2: Opening Dynamic Zone component picker...');
    const addComponentButton = page.locator('[data-strapi-field-name="ItemField"] button').filter({ hasText: /Add a component|Thêm component/ }).first();
    await addComponentButton.click();
    await page.waitForTimeout(1000);
    
    // Check which components are visible for Bank
    const visibleComponents = await page.locator('[role="dialog"] [data-testid*="component-"]').count();
    console.log(`✅ Dynamic Zone opened - Visible components for Bank: ${visibleComponents}`);
    
    // List all visible components
    const componentElements = await page.locator('[role="dialog"] [data-testid*="component-"]').all();
    for (let i = 0; i < componentElements.length; i++) {
      const componentName = await componentElements[i].textContent();
      console.log(`  - Component ${i + 1}: ${componentName}`);
    }

    // Step 3: Change ListingType while popup is open
    console.log('🔍 Step 3: Changing ListingType to Scammer while popup is open...');
    
    // Click on ListingType field while popup is open
    await page.click('[data-strapi-field-name="ListingType"] button');
    await page.waitForTimeout(500);
    await page.click('text=Scammer');
    await page.waitForTimeout(2000); // Wait for real-time filtering
    
    console.log('✅ Changed to Scammer - checking if components updated...');
    
    // Check if components updated in real-time
    const updatedComponents = await page.locator('[role="dialog"] [data-testid*="component-"]').count();
    console.log(`🔍 Components after change to Scammer: ${updatedComponents}`);
    
    // List updated components
    const updatedComponentElements = await page.locator('[role="dialog"] [data-testid*="component-"]').all();
    for (let i = 0; i < updatedComponentElements.length; i++) {
      const componentName = await updatedComponentElements[i].textContent();
      console.log(`  - Updated Component ${i + 1}: ${componentName}`);
    }

    // Step 4: Test changing back to Bank
    console.log('🔍 Step 4: Changing back to Bank...');
    await page.click('[data-strapi-field-name="ListingType"] button');
    await page.waitForTimeout(500);
    await page.click('text=Bank');
    await page.waitForTimeout(2000);
    
    const finalComponents = await page.locator('[role="dialog"] [data-testid*="component-"]').count();
    console.log(`🔍 Final components after changing back to Bank: ${finalComponents}`);

    // Step 5: Close popup and reopen to verify
    console.log('🔍 Step 5: Testing close/reopen behavior...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Reopen popup
    await addComponentButton.click();
    await page.waitForTimeout(1000);
    
    const reopenedComponents = await page.locator('[role="dialog"] [data-testid*="component-"]').count();
    console.log(`🔍 Components after close/reopen: ${reopenedComponents}`);

    // Final verification
    if (visibleComponents !== updatedComponents) {
      console.log('✅ REAL-TIME FILTERING WORKING: Components changed when ListingType changed');
    } else {
      console.log('❌ REAL-TIME FILTERING NOT WORKING: Components did not change');
    }

    await page.waitForTimeout(3000); // Keep page open for manual inspection
  });
}); 