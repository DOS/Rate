const { test, expect } = require('@playwright/test');

test.describe('Debug Seller Filtering Issue', () => {
  test('should debug why Seller selection shows all components', async ({ page }) => {
    console.log('🧪 Debugging Seller filtering issue...');
    
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
      if (text.includes('Plugin Version') || 
          text.includes('ListingType') || 
          text.includes('filtering') || 
          text.includes('components') ||
          text.includes('🎯') ||
          text.includes('📦') ||
          text.includes('✅') ||
          text.includes('❌')) {
        logs.push(text);
        console.log('📋 Console:', text);
      }
    });
    
    // Wait for page to load completely
    await page.waitForTimeout(3000);
    
    console.log('🔍 Looking for ListingType field...');
    
    // Find and click ListingType field
    const listingTypeField = page.locator('input[placeholder*="ListingType"], button:has-text("ListingType"), [data-testid*="listing"], [aria-label*="ListingType"]').first();
    
    if (await listingTypeField.isVisible()) {
      console.log('✅ Found ListingType field, clicking...');
      await listingTypeField.click();
      await page.waitForTimeout(1000);
      
      // Look for Seller option
      console.log('🔍 Looking for Seller option...');
      const sellerOption = page.locator('text=Seller, button:has-text("Seller"), [role="option"]:has-text("Seller")').first();
      
      if (await sellerOption.isVisible()) {
        console.log('✅ Found Seller option, clicking...');
        await sellerOption.click();
        await page.waitForTimeout(2000);
        
        // Check if plugin detected the selection
        const hasSellerLogs = logs.some(log => log.includes('22') || log.includes('Seller'));
        console.log('📊 Plugin detected Seller selection:', hasSellerLogs);
        
        // Now check Dynamic Zone
        console.log('🔍 Looking for Dynamic Zone...');
        const dynamicZoneButton = page.locator('button:has-text("Add a component"), button[aria-label*="Add"], button:has-text("Add component")').first();
        
        if (await dynamicZoneButton.isVisible()) {
          console.log('✅ Found Dynamic Zone button, clicking...');
          await dynamicZoneButton.click();
          await page.waitForTimeout(1000);
          
          // Count visible components
          const allComponents = await page.locator('[role="button"]:has-text("contact."), [role="button"]:has-text("content."), [role="button"]:has-text("violation.")').count();
          console.log('📊 Total visible components:', allComponents);
          
          // Check for specific components that should be visible for Seller
          const expectedComponents = [
            'contact.basic',
            'contact.location', 
            'contact.social',
            'content.description',
            'content.media-gallery'
          ];
          
          for (const component of expectedComponents) {
            const isVisible = await page.locator(`[role="button"]:has-text("${component}")`).isVisible();
            console.log(`📋 ${component}: ${isVisible ? '✅ Visible' : '❌ Hidden'}`);
          }
          
          // Check for components that should be hidden
          const shouldBeHidden = [
            'violation.report',
            'violation.evidence'
          ];
          
          for (const component of shouldBeHidden) {
            const isVisible = await page.locator(`[role="button"]:has-text("${component}")`).isVisible();
            console.log(`📋 ${component}: ${isVisible ? '❌ Should be hidden but visible' : '✅ Correctly hidden'}`);
          }
          
        } else {
          console.log('❌ Dynamic Zone button not found');
        }
        
      } else {
        console.log('❌ Seller option not found');
        // List available options
        const options = await page.locator('[role="option"], button[role="menuitem"]').allTextContents();
        console.log('📋 Available options:', options);
      }
      
    } else {
      console.log('❌ ListingType field not found');
    }
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'debug-seller-filtering.png', fullPage: true });
    
    console.log('🎯 Debug completed. Check logs above for issues.');
    console.log('📋 All console logs:', logs);
  });
  
  test('should verify API directly for Seller', async ({ page }) => {
    console.log('🧪 Testing Seller API directly...');
    
    const response = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/22/components');
    
    console.log('📡 API Response Status:', response.status());
    
    if (response.ok()) {
      const data = await response.json();
      console.log('📦 API Response:', JSON.stringify(data, null, 2));
      
      expect(response.status()).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.listingType.name).toBe('Seller');
      expect(data.data.allowedComponents).toHaveLength(5);
      
      console.log('✅ Seller API working correctly');
      console.log('📊 Expected components for Seller:', data.data.allowedComponents);
    } else {
      console.log('❌ Seller API failed');
      throw new Error(`API call failed with status ${response.status()}`);
    }
  });
}); 