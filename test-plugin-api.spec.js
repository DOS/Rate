const { test, expect } = require('@playwright/test');

test.describe('Plugin API Test', () => {
  test('Check Plugin API Endpoints', async ({ page }) => {
    console.log('🔌 Testing Smart Component Filter plugin API...');
    
    // Test plugin components endpoint
    const response1 = await page.request.get('http://localhost:1337/smart-component-filter/components');
    console.log(`📊 GET /smart-component-filter/components: ${response1.status()}`);
    
    if (response1.ok()) {
      const data = await response1.json();
      console.log(`✅ Components API working! Returned ${data.length} components`);
      console.log('📋 Components:', data.map(c => c.uid).join(', '));
    } else {
      console.log('❌ Components API failed');
    }
    
    // Test listing type components endpoint
    const response2 = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/19/components');
    console.log(`📊 GET /api/smart-component-filter/listing-type/19/components: ${response2.status()}`);
    
    if (response2.ok()) {
      const data = await response2.json();
      console.log(`✅ Listing Type API working! Returned data:`, data);
    } else {
      console.log('❌ Listing Type API failed');
    }
    
    // Test if plugin is registered by checking admin API
    const response3 = await page.request.get('http://localhost:1337/admin/plugins');
    console.log(`📊 GET /admin/plugins: ${response3.status()}`);
    
    if (response3.ok()) {
      const plugins = await response3.json();
      const smartFilterPlugin = plugins.find(p => p.name === 'smart-component-filter');
      console.log(`📊 Smart Component Filter plugin found: ${!!smartFilterPlugin}`);
      if (smartFilterPlugin) {
        console.log('🎉 Plugin is properly registered!');
      }
    }
  });

  test('Test Plugin in Browser Context', async ({ page }) => {
    console.log('🌐 Testing plugin in browser context...');
    
    // Go to admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Check if we can access the plugin API from browser
    const apiTest = await page.evaluate(async () => {
      try {
        const response = await fetch('/smart-component-filter/components');
        const data = await response.json();
        return { success: true, count: data.length, data: data };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    console.log('📊 Browser API test result:', apiTest);
    
    if (apiTest.success) {
      console.log(`✅ Plugin API accessible from browser! ${apiTest.count} components found`);
    } else {
      console.log('❌ Plugin API not accessible from browser:', apiTest.error);
    }
  });

  test('Check Plugin Registration in Strapi', async ({ page }) => {
    console.log('🔍 Checking plugin registration in Strapi...');
    
    // Check if plugin files exist and are loaded
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Check browser console for plugin loading messages
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.text().includes('Smart Component Filter') || msg.text().includes('component-multi-select')) {
        consoleLogs.push(msg.text());
      }
    });
    
    // Wait a bit for any console messages
    await page.waitForTimeout(2000);
    
    console.log('📊 Console logs related to plugin:', consoleLogs);
    
    // Check if custom field is available in window object
    const customFieldCheck = await page.evaluate(() => {
      // Check if Strapi has loaded our custom field
      return {
        strapiExists: typeof window.strapi !== 'undefined',
        customFieldRegistered: window.strapi && window.strapi.customFields && 
                              Object.keys(window.strapi.customFields).includes('plugin::smart-component-filter.component-multi-select')
      };
    });
    
    console.log('📊 Custom field registration check:', customFieldCheck);
    
    if (customFieldCheck.customFieldRegistered) {
      console.log('🎉 SUCCESS: Custom field is registered in browser!');
    } else {
      console.log('❌ Custom field not found in browser registration');
    }
  });
}); 