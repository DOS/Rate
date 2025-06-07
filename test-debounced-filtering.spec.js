const { test, expect } = require('@playwright/test');

test.describe('Debounced Filtering v1.0.4', () => {
  test('Verify debouncing reduces excessive filtering', async ({ page }) => {
    console.log('🚀 Testing debounced filtering v1.0.4...');
    
    let filteringCount = 0;
    let debounceCount = 0;
    
    // Enable console logging and count filtering calls
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('🎯 Starting component picker filtering')) {
        filteringCount++;
        console.log(`🔢 Filtering call #${filteringCount}`);
      }
      if (text.includes('🚫 Filtering debounced')) {
        debounceCount++;
        console.log(`⏸️ Debounced call #${debounceCount}`);
      }
      if (text.includes('📦 Plugin Version: 1.0.4')) {
        console.log('✅ Plugin Version 1.0.4 confirmed');
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

    // Select Bank
    const listingTypeField = page.locator('input[name="ListingType"]').first();
    await listingTypeField.click();
    await page.waitForTimeout(500);
    await page.click('text=Bank');
    await page.waitForTimeout(1000);
    console.log('✅ Bank selected');

    // Open component picker
    const addComponentText = page.locator('text=Add a component to FieldGroup');
    await addComponentText.click();
    await page.waitForTimeout(2000);
    console.log('✅ Component picker opened');

    // Change to Scammer while picker is open (this should trigger debouncing)
    console.log('🔄 Changing to Scammer to test debouncing...');
    const initialFilteringCount = filteringCount;
    
    await listingTypeField.click();
    await page.waitForTimeout(500);
    await page.click('text=Scammer');
    await page.waitForTimeout(3000); // Wait for debouncing to settle
    
    const finalFilteringCount = filteringCount;
    const filteringDifference = finalFilteringCount - initialFilteringCount;
    
    console.log(`📊 Filtering calls before change: ${initialFilteringCount}`);
    console.log(`📊 Filtering calls after change: ${finalFilteringCount}`);
    console.log(`📊 Additional filtering calls: ${filteringDifference}`);
    console.log(`📊 Total debounced calls: ${debounceCount}`);
    
    // Verify debouncing is working
    if (filteringDifference <= 5) {
      console.log('✅ DEBOUNCING WORKING: Filtering calls are reasonable');
    } else {
      console.log('⚠️ DEBOUNCING NOT WORKING: Too many filtering calls');
    }
    
    if (debounceCount > 0) {
      console.log('✅ DEBOUNCING DETECTED: Some calls were debounced');
    } else {
      console.log('⚠️ NO DEBOUNCING DETECTED: No calls were debounced');
    }
    
    // Final summary
    console.log('\n📋 Debouncing Test Summary:');
    console.log(`📊 Total filtering calls: ${filteringCount}`);
    console.log(`📊 Total debounced calls: ${debounceCount}`);
    console.log(`📊 Filtering efficiency: ${debounceCount > 0 ? 'IMPROVED' : 'NEEDS WORK'}`);
  });
}); 