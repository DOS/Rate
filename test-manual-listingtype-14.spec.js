const { test, expect } = require('@playwright/test');

test.describe('Manual Test - ListingType 14', () => {
  test('manual test for ListingType 14 hiding all components', async ({ page }) => {
    console.log('🧪 Manual test for ListingType 14...');
    
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
    page.on('response', response => {
      if (response.url().includes('/api/smart-component-filter/listing-type/')) {
        console.log(`[API] ${response.url()} - Status: ${response.status()}`);
      }
    });
    
    console.log('🔍 Step 1: Go directly to Strapi admin');
    await page.goto('http://localhost:1337/admin');
    await page.waitForTimeout(5000);
    
    console.log('🔍 Step 2: Manual navigation required');
    console.log('📋 Please manually:');
    console.log('   1. Login to Strapi admin');
    console.log('   2. Go to Content Manager > Item > Create new entry');
    console.log('   3. Select "Test CSS Variables Theme" in ListingType field');
    console.log('   4. Click "Add a component to FieldGroup"');
    console.log('   5. Check if ALL categories are hidden');
    
    // Wait for manual testing
    await page.waitForTimeout(60000); // Wait 1 minute for manual testing
    
    console.log('✅ Manual test completed');
  });
}); 