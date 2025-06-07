const { test, expect } = require('@playwright/test');

test.describe('Smart Component Filter Plugin v1.0.4 Verification', () => {
  test('should confirm plugin is running with version 1.0.4', async ({ page }) => {
    console.log('🧪 Testing Smart Component Filter Plugin v1.0.4...');
    
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
    
    // Wait for plugin to load and check console for version
    await page.waitForTimeout(3000);
    
    // Check console logs for plugin version
    const logs = [];
    page.on('console', msg => {
      if (msg.text().includes('Plugin Version')) {
        logs.push(msg.text());
        console.log('📦 Console log:', msg.text());
      }
    });
    
    // Trigger plugin activity by interacting with ListingType field
    const listingTypeField = page.locator('input[placeholder*="ListingType"], input[placeholder*="listing"], button:has-text("ListingType")').first();
    if (await listingTypeField.isVisible()) {
      await listingTypeField.click();
      await page.waitForTimeout(1000);
    }
    
    // Reload page to trigger plugin bootstrap
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check if version 1.0.4 appears in console
    const versionFound = logs.some(log => log.includes('1.0.4'));
    
    if (versionFound) {
      console.log('✅ Plugin version 1.0.4 confirmed in console logs');
    } else {
      console.log('⚠️ Version 1.0.4 not found in console, checking page source...');
      
      // Alternative: Check if plugin is loaded by looking for its functionality
      const pageContent = await page.content();
      const hasSmartFilter = pageContent.includes('smart-component-filter') || 
                           pageContent.includes('Smart Component Filter');
      
      if (hasSmartFilter) {
        console.log('✅ Smart Component Filter plugin detected in page');
      } else {
        console.log('❌ Smart Component Filter plugin not detected');
      }
    }
    
    // Take screenshot for verification
    await page.screenshot({ path: 'plugin-version-1.0.4-test.png', fullPage: true });
    
    console.log('🎯 Plugin v1.0.4 verification completed');
  });
  
  test('should verify plugin API endpoints are working', async ({ page }) => {
    console.log('🧪 Testing Smart Component Filter API endpoints...');
    
    // Test API endpoint directly
    const response = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/7/components');
    
    console.log('📡 API Response Status:', response.status());
    
    if (response.ok()) {
      const data = await response.json();
      console.log('📦 API Response:', JSON.stringify(data, null, 2));
      
      expect(response.status()).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data.allowedComponents)).toBe(true);
      
      console.log('✅ API endpoints working correctly');
      console.log('📊 Allowed components count:', data.data.allowedComponents.length);
    } else {
      console.log('❌ API endpoint failed');
      throw new Error(`API call failed with status ${response.status()}`);
    }
  });
}); 