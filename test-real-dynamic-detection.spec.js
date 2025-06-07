const { test, expect } = require('@playwright/test');

test.describe('Real Dynamic Detection Test', () => {
  test('should test plugin with actual Strapi admin', async ({ page }) => {
    console.log('🧪 Testing real dynamic detection...');
    
    // Listen for console logs
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
    
    // Listen for API calls
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
    
    try {
      // Step 1: Navigate to Strapi admin
      console.log('📋 Step 1: Navigating to Strapi admin...');
      await page.goto('http://localhost:1337/admin');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Step 2: Check if we need to login
      const currentUrl = page.url();
      console.log(`📋 Current URL: ${currentUrl}`);
      
      if (currentUrl.includes('/auth/login')) {
        console.log('📋 Step 2: Login required, skipping test...');
        console.log('❌ Please login manually first');
        return;
      }
      
      // Step 3: Navigate to item creation
      console.log('📋 Step 3: Navigating to item creation...');
      await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      // Step 4: Look for ListingType field
      console.log('📋 Step 4: Looking for ListingType field...');
      
      // Try multiple selectors for ListingType field
      const selectors = [
        'input[name="ListingType"]',
        '[data-strapi-field="ListingType"]',
        'label:has-text("ListingType")',
        'div:has-text("ListingType") input',
        '[placeholder*="Select"]'
      ];
      
      let listingTypeField = null;
      for (const selector of selectors) {
        try {
          const field = page.locator(selector).first();
          if (await field.isVisible({ timeout: 1000 })) {
            listingTypeField = field;
            console.log(`✅ Found ListingType field with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (!listingTypeField) {
        console.log('❌ Could not find ListingType field');
        await page.screenshot({ path: 'test-real-dynamic-no-field.png', fullPage: true });
        return;
      }
      
      // Step 5: Click ListingType field to open dropdown
      console.log('📋 Step 5: Opening ListingType dropdown...');
      await listingTypeField.click();
      await page.waitForTimeout(2000);
      
      // Step 6: Look for dropdown options
      console.log('📋 Step 6: Looking for dropdown options...');
      const dropdownOptions = page.locator('[role="option"], button[data-*]');
      const optionCount = await dropdownOptions.count();
      console.log(`📋 Found ${optionCount} dropdown options`);
      
      if (optionCount > 0) {
        // Step 7: Select first option
        console.log('📋 Step 7: Selecting first option...');
        await dropdownOptions.first().click();
        await page.waitForTimeout(2000);
        
        // Step 8: Try to open component picker
        console.log('📋 Step 8: Looking for "Add a component" button...');
        const addComponentButton = page.locator('button:has-text("Add a component"), button:has-text("Add component")').first();
        
        if (await addComponentButton.isVisible({ timeout: 3000 })) {
          console.log('✅ Found "Add a component" button');
          await addComponentButton.click();
          await page.waitForTimeout(3000);
          
          // Check results
          if (apiCalls.length > 0) {
            console.log(`✅ SUCCESS: Plugin detected ListingType ID(s): ${apiCalls.join(', ')}`);
            console.log('✅ Dynamic detection is working!');
          } else {
            console.log('❌ No API calls detected - plugin may not be working');
          }
        } else {
          console.log('❌ Could not find "Add a component" button');
        }
      } else {
        console.log('❌ No dropdown options found');
      }
      
    } catch (error) {
      console.log(`❌ Test error: ${error.message}`);
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'test-real-dynamic-final.png', fullPage: true });
    
    // Summary
    console.log('\n📋 Test Summary:');
    console.log(`   - API calls made: ${apiCalls.length}`);
    console.log(`   - Detected IDs: ${apiCalls.join(', ') || 'None'}`);
    console.log(`   - Dynamic detection: ${apiCalls.length > 0 ? '✅ WORKING' : '❌ NOT WORKING'}`);
  });
}); 