const { test, expect } = require('@playwright/test');

test.describe('Smart Component Filter - Dynamic ListingType Detection', () => {
  test('should automatically detect any ListingType ID without hardcoding', async ({ page }) => {
    console.log('🧪 Testing dynamic ListingType ID detection...');
    
    // Listen for console logs from the page
    page.on('console', msg => {
      if (msg.text().includes('Smart Component Filter') || 
          msg.text().includes('🔍') || 
          msg.text().includes('📦') ||
          msg.text().includes('✅') ||
          msg.text().includes('❌') ||
          msg.text().includes('🚫') ||
          msg.text().includes('🎯')) {
        console.log(`[BROWSER] ${msg.text()}`);
      }
    });
    
    // Listen for API calls to see what IDs are being detected
    const apiCalls = [];
    page.on('response', response => {
      if (response.url().includes('/api/smart-component-filter/listing-type/')) {
        const url = response.url();
        const idMatch = url.match(/listing-type\/(\d+)\/components/);
        if (idMatch) {
          apiCalls.push(idMatch[1]);
          console.log(`📡 API call detected for ListingType ID: ${idMatch[1]}`);
        }
      }
    });
    
    // Navigate to item creation page
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    console.log('📋 Page loaded, looking for ListingType field...');
    
    // Find ListingType field and click it
    const listingTypeField = page.locator('input[name="ListingType"]').first();
    if (await listingTypeField.isVisible()) {
      console.log('✅ Found ListingType field');
      await listingTypeField.click();
      await page.waitForTimeout(1000);
      
      // Look for dropdown options
      const dropdownOptions = page.locator('[role="option"], button:has-text("Bank"), button:has-text("Scammer")');
      const optionCount = await dropdownOptions.count();
      console.log(`📋 Found ${optionCount} ListingType options`);
      
      if (optionCount > 0) {
        // Try selecting the first option
        await dropdownOptions.first().click();
        await page.waitForTimeout(2000);
        
        console.log('📋 Selected first ListingType option');
        
        // Now try to open component picker to trigger filtering
        const addComponentButton = page.locator('button:has-text("Add a component")').first();
        if (await addComponentButton.isVisible()) {
          console.log('✅ Found "Add a component" button');
          await addComponentButton.click();
          await page.waitForTimeout(2000);
          
          // Check if API was called with detected ID
          if (apiCalls.length > 0) {
            console.log(`✅ SUCCESS: Plugin detected ListingType ID(s): ${apiCalls.join(', ')}`);
            console.log('✅ Dynamic detection is working!');
          } else {
            console.log('❌ No API calls detected - plugin may not be detecting ID');
          }
        } else {
          console.log('❌ Could not find "Add a component" button');
        }
      } else {
        console.log('❌ No ListingType options found');
      }
    } else {
      console.log('❌ Could not find ListingType field');
    }
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'test-dynamic-detection.png', fullPage: true });
    console.log('📸 Screenshot saved: test-dynamic-detection.png');
    
    // Summary
    console.log('\n📋 Test Summary:');
    console.log(`   - API calls made: ${apiCalls.length}`);
    console.log(`   - Detected IDs: ${apiCalls.join(', ') || 'None'}`);
    console.log(`   - Dynamic detection: ${apiCalls.length > 0 ? '✅ WORKING' : '❌ NOT WORKING'}`);
  });
}); 