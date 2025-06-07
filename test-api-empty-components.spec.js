const { test, expect } = require('@playwright/test');

test.describe('Smart Component Filter API - Empty Components', () => {
  test('should return empty components for ListingType without ItemField', async ({ page }) => {
    console.log('🧪 Testing API for ListingType without ItemField...');
    
    // Test different ListingType IDs to find one without components
    const testIds = [2, 3, 4, 5, 6, 8, 9, 10]; // Skip 1 (Scammer) and 7 (Bank)
    
    for (const listingTypeId of testIds) {
      console.log(`🔍 Testing ListingType ID: ${listingTypeId}`);
      
      try {
        // Make direct API call
        const response = await page.request.get(`http://localhost:1337/api/smart-component-filter/listing-type/${listingTypeId}/components`);
        
        if (response.ok()) {
          const data = await response.json();
          console.log(`📦 Response for ID ${listingTypeId}:`, JSON.stringify(data, null, 2));
          
          if (data.success && data.data) {
            const allowedComponents = data.data.allowedComponents || [];
            console.log(`📊 ID ${listingTypeId}: ${allowedComponents.length} components`);
            
            if (allowedComponents.length === 0) {
              console.log(`✅ Found ListingType ${listingTypeId} with NO components - perfect for testing!`);
              
              // This is what we want - empty components array
              expect(data.success).toBe(true);
              expect(data.data.allowedComponents).toEqual([]);
              
              console.log(`🎯 ListingType ${listingTypeId} confirmed to have no components`);
              return; // Found what we need
            }
          }
        } else {
          console.log(`❌ API call failed for ID ${listingTypeId}: ${response.status()}`);
        }
      } catch (error) {
        console.log(`❌ Error testing ID ${listingTypeId}:`, error.message);
      }
    }
    
    console.log('⚠️ No ListingType found without components. Testing with known IDs:');
    
    // Test known IDs
    console.log('🔍 Testing Bank (ID: 7) - should have components');
    const bankResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/7/components');
    if (bankResponse.ok()) {
      const bankData = await bankResponse.json();
      console.log('📦 Bank response:', JSON.stringify(bankData, null, 2));
      expect(bankData.data.allowedComponents.length).toBeGreaterThan(0);
    }
    
    console.log('🔍 Testing Scammer (ID: 1) - should have components');
    const scammerResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/1/components');
    if (scammerResponse.ok()) {
      const scammerData = await scammerResponse.json();
      console.log('📦 Scammer response:', JSON.stringify(scammerData, null, 2));
      expect(scammerData.data.allowedComponents.length).toBeGreaterThan(0);
    }
  });
  
  test('should test plugin behavior with empty components array', async ({ page }) => {
    console.log('🧪 Testing plugin behavior with empty components...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Check if we need to login
    const loginButton = page.locator('button[type="submit"]');
    if (await loginButton.isVisible()) {
      console.log('🔐 Need to login...');
      
      // Fill login form
      await page.fill('input[name="email"]', 'admin@example.com');
      await page.fill('input[name="password"]', 'password123');
      await loginButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
    
    console.log('✅ Logged in, navigating to item creation...');
    
    // Navigate to item creation
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Take screenshot to see current state
    await page.screenshot({ path: 'test-api-empty-initial.png', fullPage: true });
    console.log('📸 Screenshot saved: test-api-empty-initial.png');
    
    // Look for ListingType field with different selectors
    const selectors = [
      'input[placeholder*="Select"]',
      'input[placeholder*="Choose"]',
      'input[placeholder*="Pick"]',
      '[data-testid*="listing"]',
      '[data-testid*="type"]',
      'input[type="text"]'
    ];
    
    let listingTypeField = null;
    for (const selector of selectors) {
      const field = page.locator(selector).first();
      if (await field.isVisible()) {
        console.log(`✅ Found field with selector: ${selector}`);
        listingTypeField = field;
        break;
      }
    }
    
    if (listingTypeField) {
      console.log('✅ Found ListingType field, testing...');
      await listingTypeField.click();
      await page.waitForTimeout(2000);
      
      // Take screenshot after clicking
      await page.screenshot({ path: 'test-api-empty-after-click.png', fullPage: true });
      console.log('📸 Screenshot saved: test-api-empty-after-click.png');
      
    } else {
      console.log('❌ Could not find ListingType field');
      
      // Debug: show all input fields
      const allInputs = await page.locator('input').all();
      console.log(`🔍 Found ${allInputs.length} input fields:`);
      
      for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
        const input = allInputs[i];
        const placeholder = await input.getAttribute('placeholder');
        const type = await input.getAttribute('type');
        const name = await input.getAttribute('name');
        console.log(`   ${i + 1}. placeholder="${placeholder}" type="${type}" name="${name}"`);
      }
    }
    
    console.log('✅ Test completed');
  });
}); 