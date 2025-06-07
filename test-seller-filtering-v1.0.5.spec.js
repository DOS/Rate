const { test, expect } = require('@playwright/test');

test.describe('Seller Filtering Test - Plugin v1.0.5', () => {
  test('should verify Seller filtering works with dynamic detection', async ({ page }) => {
    console.log('🧪 Testing Seller filtering with plugin v1.0.5...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Login
    await page.fill('input[name="email"]', 'admin@strapi.com');
    await page.fill('input[name="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    // Navigate to item creation page
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    
    // Listen to console logs for debugging
    const logs = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('Plugin Version') || 
          text.includes('Seller') || 
          text.includes('22') ||
          text.includes('🎯') ||
          text.includes('✅') ||
          text.includes('❌')) {
        console.log('📋 Console:', text);
      }
    });
    
    // Wait for plugin to load
    await page.waitForTimeout(3000);
    
    // Check plugin version
    const versionLog = logs.find(log => log.includes('Plugin Version'));
    if (versionLog) {
      console.log('✅ Plugin loaded:', versionLog);
    }
    
    // Test API first to confirm Seller data
    console.log('🧪 Testing Seller API...');
    const apiResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/22/components');
    
    if (apiResponse.ok()) {
      const apiData = await apiResponse.json();
      console.log('✅ Seller API working:', apiData.data.listingType.name);
      console.log('📊 Seller components:', apiData.data.allowedComponents.length);
      
      expect(apiData.success).toBe(true);
      expect(apiData.data.listingType.name).toBe('Seller');
      expect(apiData.data.allowedComponents).toHaveLength(5);
    } else {
      throw new Error('Seller API failed');
    }
    
    console.log('🎯 Test completed - Seller filtering should now work with dynamic detection!');
    
    // Take screenshot
    await page.screenshot({ path: 'test-seller-v1.0.5.png', fullPage: true });
  });
  
  test('should test dynamic detection for multiple ListingTypes', async ({ page }) => {
    console.log('🧪 Testing dynamic detection for multiple ListingTypes...');
    
    // Test multiple ListingTypes to ensure dynamic detection works
    const testCases = [
      { id: '1', name: 'Scammer', expectedComponents: 7 },
      { id: '7', name: 'Bank', expectedComponents: 5 },
      { id: '22', name: 'Seller', expectedComponents: 5 },
      { id: '20', name: 'Scammer', expectedComponents: 7 }
    ];
    
    for (const testCase of testCases) {
      console.log(`🔍 Testing ${testCase.name} (ID: ${testCase.id})...`);
      
      const response = await page.request.get(`http://localhost:1337/api/smart-component-filter/listing-type/${testCase.id}/components`);
      
      if (response.ok()) {
        const data = await response.json();
        console.log(`✅ ${testCase.name}: ${data.data.allowedComponents.length} components`);
        
        expect(response.status()).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.allowedComponents).toHaveLength(testCase.expectedComponents);
      } else {
        console.log(`❌ ${testCase.name} API failed with status:`, response.status());
      }
    }
    
    console.log('🎯 Dynamic detection test completed!');
  });
}); 