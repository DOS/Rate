const { test, expect } = require('@playwright/test');

test.describe('Manual Test - Empty Components', () => {
  test('manual verification of empty components hiding', async ({ page }) => {
    console.log('🧪 Manual test for empty components hiding...');
    
    // Step 1: Verify API behavior for different ListingTypes
    console.log('🔍 Step 1: Testing API responses');
    
    // Test Bank (should have components)
    const bankResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/7/components');
    if (bankResponse.ok()) {
      const bankData = await bankResponse.json();
      console.log('📦 Bank (ID 7) components:', bankData.data.allowedComponents.length);
      console.log('   Components:', bankData.data.allowedComponents);
    }
    
    // Test Scammer (should have components)
    const scammerResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/1/components');
    if (scammerResponse.ok()) {
      const scammerData = await scammerResponse.json();
      console.log('📦 Scammer (ID 1) components:', scammerData.data.allowedComponents.length);
      console.log('   Components:', scammerData.data.allowedComponents);
    }
    
    // Test ID 14 (should have NO components)
    const emptyResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/14/components');
    if (emptyResponse.ok()) {
      const emptyData = await emptyResponse.json();
      console.log('📦 Test CSS Variables Theme (ID 14) components:', emptyData.data.allowedComponents.length);
      console.log('   Components:', emptyData.data.allowedComponents);
      
      if (emptyData.data.allowedComponents.length === 0) {
        console.log('✅ CONFIRMED: ID 14 returns empty components array');
      } else {
        console.log('❌ UNEXPECTED: ID 14 should return empty array');
      }
    }
    
    // Step 2: Navigate to Strapi and login
    console.log('🔍 Step 2: Navigate to Strapi admin');
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Login
    const loginButton = page.locator('button[type="submit"]');
    if (await loginButton.isVisible()) {
      console.log('🔐 Logging in...');
      await page.fill('input[name="email"]', 'admin@example.com');
      await page.fill('input[name="password"]', 'password123');
      await loginButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    }
    
    // Step 3: Navigate to item creation
    console.log('🔍 Step 3: Navigate to item creation');
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: 'manual-test-initial.png', fullPage: true });
    console.log('📸 Initial screenshot saved: manual-test-initial.png');
    
    // Step 4: Manual instructions
    console.log('');
    console.log('🔧 MANUAL TESTING INSTRUCTIONS:');
    console.log('');
    console.log('1. Look at the screenshot: manual-test-initial.png');
    console.log('2. In the browser window that opened:');
    console.log('   a) Find the "ListingType" field');
    console.log('   b) Click on it to open the dropdown');
    console.log('   c) Select "Test CSS Variables Theme" (this should have NO components)');
    console.log('   d) Scroll down to find "FieldGroup" section');
    console.log('   e) Click "Add a component to FieldGroup" button');
    console.log('   f) Check if ALL categories are hidden (contact, violation, info, etc.)');
    console.log('');
    console.log('3. Expected behavior:');
    console.log('   - When "Test CSS Variables Theme" is selected');
    console.log('   - Opening component picker should show NO categories');
    console.log('   - All categories should be hidden because no components are allowed');
    console.log('');
    console.log('4. Compare with Bank/Scammer:');
    console.log('   - Select "Bank" -> should show contact + media categories');
    console.log('   - Select "Scammer" -> should show contact + violation categories');
    console.log('   - Select "Test CSS Variables Theme" -> should show NO categories');
    console.log('');
    console.log('✅ If all categories are hidden for "Test CSS Variables Theme", the feature works!');
    console.log('❌ If categories are still visible, the feature needs fixing.');
    console.log('');
    
    // Keep the test running for manual verification
    await page.waitForTimeout(60000); // Wait 1 minute for manual testing
    
    console.log('✅ Manual test completed');
  });
}); 