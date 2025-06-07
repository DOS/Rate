const { test, expect } = require('@playwright/test');

test('Test Smart Loading Dynamic Field', async ({ page }) => {
  console.log('🧠 Testing Smart Loading Dynamic Field functionality...');
  
  // Wait for Strapi to start
  await page.waitForTimeout(10000);
  
  // Login to Strapi
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(3000);
  
  console.log('📝 Logging in...');
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  
  console.log('✅ Logged in successfully');
  
  // Navigate to Content Manager -> Item
  console.log('📋 Going to Content Manager...');
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item');
  await page.waitForTimeout(3000);
  
  // Look for an existing item to edit
  console.log('🔍 Looking for existing items...');
  const itemLinks = page.locator('a[href*="/content-manager/collection-types/api::item.item/"]');
  const itemCount = await itemLinks.count();
  
  if (itemCount > 0) {
    console.log(`✅ Found ${itemCount} items, clicking on first one...`);
    await itemLinks.first().click();
    await page.waitForTimeout(3000);
    
    console.log('📄 On item edit page');
    await page.screenshot({ path: 'smart-loading-item-page.png' });
    
    // Look for ListingType field (this should trigger smart loading)
    console.log('🎯 Looking for ListingType field...');
    const listingTypeField = page.locator('[data-testid*="listing"], input[name*="ListingType"], select[name*="ListingType"]');
    
    if (await listingTypeField.isVisible()) {
      console.log('✅ Found ListingType field');
      
      // Try to interact with it to trigger smart loading
      await listingTypeField.click();
      await page.waitForTimeout(2000);
      
      console.log('🔄 Triggered field interaction - checking for API calls...');
      await page.screenshot({ path: 'smart-loading-field-interaction.png' });
      
      // Wait a bit more for any API calls
      await page.waitForTimeout(3000);
      
    } else {
      console.log('❌ ListingType field not found');
      
      // Let's see what fields are available
      const allInputs = await page.locator('input, select, textarea').allTextContents();
      console.log('Available form fields:', allInputs.filter(text => text.trim()));
    }
    
  } else {
    console.log('❌ No items found, trying to create new item...');
    
    // Try to create new item
    const createButton = page.locator('button:has-text("Create new entry"), button:has-text("Add new"), a:has-text("Create")');
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(3000);
      console.log('📝 On create new item page');
      await page.screenshot({ path: 'smart-loading-create-page.png' });
    }
  }
  
  // Test direct API call to see if smart loading works
  console.log('🔧 Testing direct API call...');
  
  const apiResponse = await page.evaluate(async () => {
    try {
      // Try different ListingType IDs
      const testIds = [1, 2, 3, 7]; // ID 7 worked in logs
      const results = [];
      
      for (const id of testIds) {
        try {
          const response = await fetch(`/api/smart-component-filter/listing-type/${id}/components`);
          const data = await response.json();
          results.push({
            id,
            status: response.status,
            data: data
          });
          console.log(`API call for ID ${id}:`, response.status, data);
        } catch (error) {
          results.push({
            id,
            status: 'error',
            error: error.message
          });
        }
      }
      
      return results;
    } catch (error) {
      return { error: error.message };
    }
  });
  
  console.log('🌐 API Test Results:', JSON.stringify(apiResponse, null, 2));
  
  // Check if any API calls were successful
  const successfulCalls = apiResponse.filter(result => result.status === 200);
  if (successfulCalls.length > 0) {
    console.log('🎉 SUCCESS! Smart Loading API is working!');
    console.log('✅ Working ListingType IDs:', successfulCalls.map(r => r.id));
    
    // Show the data structure
    successfulCalls.forEach(result => {
      console.log(`📊 Data for ListingType ${result.id}:`, result.data);
    });
  } else {
    console.log('❌ No successful API calls found');
  }
  
  console.log('🧠 Smart Loading test completed!');
}); 