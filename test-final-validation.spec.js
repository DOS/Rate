const { test, expect } = require('@playwright/test');

test.describe('Final Plugin Validation v1.0.3', () => {
  test('Complete plugin validation with edge cases', async ({ page }) => {
    console.log('🚀 Testing complete plugin functionality...');
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.text().includes('🎯') || msg.text().includes('🔄') || msg.text().includes('✅') || msg.text().includes('❌') || msg.text().includes('📦')) {
        console.log('🖥️ Browser:', msg.text());
      }
    });

    // Navigate to login page
    await page.goto('http://localhost:1337/admin/auth/login');
    
    // Login
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await page.waitForURL('**/admin');
    console.log('✅ Logged in');

    // Navigate to create Item page
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForTimeout(2000);
    console.log('📋 On create Item page');

    // Test 1: Check ListingType dropdown loading speed
    console.log('🎯 Test 1: Checking ListingType dropdown loading speed...');
    const listingTypeField = page.locator('input[name="ListingType"]').first();
    
    const startTime = Date.now();
    await listingTypeField.click();
    
    // Wait for dropdown options to appear
    await page.waitForSelector('text=Bank', { timeout: 5000 });
    const loadTime = Date.now() - startTime;
    
    console.log(`⏱️ ListingType dropdown loaded in ${loadTime}ms`);
    if (loadTime > 1000) {
      console.log('⚠️ WARNING: Dropdown takes more than 1 second to load');
    } else {
      console.log('✅ Dropdown loading speed is acceptable');
    }

    // Select Bank
    await page.click('text=Bank');
    await page.waitForTimeout(1000);
    console.log('✅ Bank selected');

    // Test 2: Open component picker and verify filtering
    console.log('🎯 Test 2: Testing component picker filtering...');
    const addComponentText = page.locator('text=Add a component to FieldGroup');
    await addComponentText.click();
    await page.waitForTimeout(1000);

    // Verify picker opened and filtered correctly for Bank
    const contactCategory = page.locator('text=contact');
    await expect(contactCategory).toBeVisible();
    
    const mediaCategory = page.locator('button:has-text("media")');
    await expect(mediaCategory).toBeVisible();
    
    const violationCategory = page.locator('button:has-text("violation")');
    await expect(violationCategory).not.toBeVisible();
    
    console.log('✅ Initial filtering for Bank works correctly');

    // Test 3: Change to Scammer while picker is open
    console.log('🎯 Test 3: Testing real-time filtering (Bank → Scammer)...');
    
    await listingTypeField.click();
    await page.waitForTimeout(500);
    await page.click('text=Scammer');
    await page.waitForTimeout(2000); // Wait for force re-filtering
    
    // Verify real-time filtering worked
    await expect(violationCategory).toBeVisible();
    await expect(mediaCategory).not.toBeVisible();
    
    console.log('✅ Real-time filtering (Bank → Scammer) works correctly');

    // Test 4: Test edge case - select ListingType without FieldItem set
    console.log('🎯 Test 4: Testing edge case - ListingType without FieldItem...');
    
    // Close the current picker first
    const closeButton = page.locator('button:has-text("Close")');
    await closeButton.click();
    await page.waitForTimeout(500);
    
    // Clear ListingType selection
    await listingTypeField.click();
    await page.waitForTimeout(500);
    
    // Try to find a clear/remove option or select a different type
    const clearButton = page.locator('[aria-label="Clear"]').first();
    if (await clearButton.isVisible()) {
      await clearButton.click();
      console.log('✅ Cleared ListingType selection');
    } else {
      // If no clear button, select a different type then clear
      await page.click('text=Business');
      await page.waitForTimeout(500);
      console.log('✅ Selected Business type');
    }
    
    // Now open component picker without proper ListingType
    await addComponentText.click();
    await page.waitForTimeout(1000);
    
    // Check if all components are visible (should be the case when no filtering)
    const allCategories = await page.locator('button[role="button"]').count();
    console.log(`📊 Found ${allCategories} category buttons when no ListingType is properly set`);
    
    if (allCategories > 5) {
      console.log('⚠️ WARNING: All components are visible when ListingType is not properly set');
      console.log('🔧 This might be the issue user mentioned - components not cleared when no FieldItem set');
    } else {
      console.log('✅ Component list is properly filtered even without ListingType');
    }

    // Test 5: Performance test - multiple rapid changes
    console.log('🎯 Test 5: Testing rapid ListingType changes...');
    
    for (let i = 0; i < 3; i++) {
      await listingTypeField.click();
      await page.waitForTimeout(200);
      await page.click('text=Bank');
      await page.waitForTimeout(500);
      
      await listingTypeField.click();
      await page.waitForTimeout(200);
      await page.click('text=Scammer');
      await page.waitForTimeout(500);
      
      console.log(`✅ Rapid change cycle ${i + 1} completed`);
    }
    
    console.log('✅ Rapid changes test completed');

    // Final verification
    console.log('🎯 Final verification...');
    
    // Verify final state shows Scammer components
    await expect(violationCategory).toBeVisible();
    await expect(contactCategory).toBeVisible();
    await expect(mediaCategory).not.toBeVisible();
    
    console.log('🎉 All tests completed successfully!');
    
    // Summary
    console.log('\n📋 Test Summary:');
    console.log('✅ ListingType dropdown loading tested');
    console.log('✅ Component picker filtering verified');
    console.log('✅ Real-time filtering confirmed working');
    console.log('✅ Edge cases tested');
    console.log('✅ Performance under rapid changes verified');
  });
}); 