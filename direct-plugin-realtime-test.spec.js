const { test, expect } = require('@playwright/test');

test.describe('Direct Plugin Real-time Test', () => {
  test('Test plugin functionality directly', async ({ page }) => {
    // Enable comprehensive console logging
    page.on('console', msg => {
      console.log(`🎯 CONSOLE: ${msg.text()}`);
    });

    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    
    // Login
    await page.fill('input[name="email"]', 'admin@strapi.io');
    await page.fill('input[name="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('✅ Logged in successfully');

    // Navigate to Item create page
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForTimeout(5000);
    console.log('✅ Navigated to Item create page');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: 'direct-plugin-test-page.png' });

    // Inject test script to manually trigger plugin functionality
    await page.evaluate(() => {
      console.log('🧪 Starting manual plugin test...');
      
      // Check if plugin is loaded
      if (window.smartComponentFilter) {
        console.log('✅ Smart Component Filter plugin found in window');
      } else {
        console.log('❌ Smart Component Filter plugin not found in window');
      }

      // Simulate ListingType selection
      console.log('🧪 Simulating ListingType selection...');
      
      // Create a mock form state
      const mockFormState = {
        ListingType: { id: 7, name: 'Bank' }
      };
      
      // Try to trigger filtering manually
      if (typeof window.triggerComponentFiltering === 'function') {
        console.log('🧪 Triggering component filtering manually...');
        window.triggerComponentFiltering(7);
      }

      // Check for any global filtering functions
      const globalFunctions = Object.keys(window).filter(key => 
        key.includes('filter') || key.includes('component') || key.includes('smart')
      );
      console.log('🔍 Global functions related to filtering:', globalFunctions);

      // Look for any Strapi-related objects
      if (window.strapi) {
        console.log('✅ Strapi object found');
        console.log('🔍 Strapi keys:', Object.keys(window.strapi));
      }

      // Check for any plugin-related objects
      const pluginObjects = Object.keys(window).filter(key => 
        key.includes('plugin') || key.includes('Plugin')
      );
      console.log('🔍 Plugin-related objects:', pluginObjects);

      return 'Manual test completed';
    });

    // Wait for any async operations
    await page.waitForTimeout(2000);

    // Try to find and interact with form elements using different strategies
    console.log('🔍 Looking for form elements...');

    // Strategy 1: Look for any relation field
    const relationFields = await page.locator('[data-strapi-field-name]').all();
    console.log(`Found ${relationFields.length} fields with data-strapi-field-name`);

    // Strategy 2: Look for buttons that might open dropdowns
    const allButtons = await page.locator('button').all();
    console.log(`Found ${allButtons.length} buttons on page`);

    // Strategy 3: Look for any text that might indicate ListingType
    const pageText = await page.textContent('body');
    const hasListingTypeText = pageText.includes('ListingType') || pageText.includes('Bank') || pageText.includes('Scammer');
    console.log(`Page contains ListingType-related text: ${hasListingTypeText}`);

    // Strategy 4: Check if we're on the right page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Strategy 5: Wait for any dynamic content to load
    await page.waitForTimeout(5000);

    // Take final screenshot
    await page.screenshot({ path: 'direct-plugin-test-final.png' });

    // Try to manually trigger the API call
    const apiResponse = await page.evaluate(async () => {
      try {
        console.log('🧪 Testing API call manually...');
        const response = await fetch('/api/smart-component-filter/listing-type/7/components');
        const data = await response.json();
        console.log('✅ API call successful:', data);
        return data;
      } catch (error) {
        console.log('❌ API call failed:', error.message);
        return null;
      }
    });

    console.log('🎯 API Response:', apiResponse);

    await page.waitForTimeout(10000); // Keep page open for inspection
  });
}); 