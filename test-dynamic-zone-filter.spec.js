const { test, expect } = require('@playwright/test');

test.describe('🎯 Dynamic Zone Component Filtering Test', () => {
  test('Test Enhanced Filter in Dynamic Zone', async ({ page }) => {
    console.log('🚀 Testing Dynamic Zone component filtering...');
    
    // Setup console logging to catch plugin messages
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Smart Component Filter') || 
          text.includes('component picker') ||
          text.includes('Enhanced Filter') ||
          text.includes('filtering') ||
          text.includes('🎯') ||
          text.includes('✅') ||
          text.includes('❌')) {
        consoleLogs.push(text);
        console.log(`🖥️ Browser: ${text}`);
      }
    });
    
    // Login to admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    const emailInput = await page.locator('input[name="email"]').isVisible();
    if (emailInput) {
      console.log('🔑 Logging in...');
      await page.fill('input[name="email"]', 'joy@joy.vn');
      await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }
    
    // Navigate to an existing item
    console.log('📝 Navigating to Item edit page...');
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item');
    await page.waitForLoadState('networkidle');
    
    // Find and click on an existing item
    const itemRows = await page.locator('tr, [data-testid="list-item"], .list-item').count();
    console.log(`📊 Found ${itemRows} items`);
    
    if (itemRows > 1) { // Skip header row
      await page.locator('tr, [data-testid="list-item"], .list-item').nth(1).click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-item-edit-page.png' });
      
      // Check current ListingType
      const listingTypeField = await page.locator('select[name="ListingType"], [name="ListingType"]').first();
      if (await listingTypeField.isVisible()) {
        const currentListingType = await listingTypeField.inputValue();
        console.log(`📊 Current ListingType: ${currentListingType}`);
        
        // Test different listing types
        const testTypes = ['Bank', 'Scammer', 'Business'];
        
        for (const testType of testTypes) {
          console.log(`\n🔄 Testing ${testType} listing type...`);
          
          // Change listing type
          await listingTypeField.selectOption(testType);
          await page.waitForTimeout(1000);
          
          // Look for Dynamic Zone sections
          const dynamicZoneSelectors = [
            '[data-testid*="dynamic"], [data-testid*="zone"]',
            '[class*="dynamic"], [class*="zone"]',
            'button:has-text("Add a component")',
            'button:has-text("Add component")',
            'button[aria-label*="Add"]',
            'button[title*="Add"]'
          ];
          
          let addComponentButton = null;
          for (const selector of dynamicZoneSelectors) {
            const button = page.locator(selector).first();
            if (await button.isVisible()) {
              addComponentButton = button;
              console.log(`✅ Found add component button with selector: ${selector}`);
              break;
            }
          }
          
          if (addComponentButton) {
            console.log(`🎯 Opening component picker for ${testType}...`);
            
            // Click to open component picker
            await addComponentButton.click();
            await page.waitForTimeout(2000); // Wait for picker to load
            
            await page.screenshot({ path: `test-component-picker-${testType.toLowerCase()}.png` });
            
            // Count visible components
            const componentSelectors = [
              'button[role="button"]',
              'h3[role="button"]',
              'h2[role="button"]',
              '[data-testid*="component"]',
              'button:not([aria-label*="Close"])'
            ];
            
            let visibleComponents = 0;
            for (const selector of componentSelectors) {
              const components = await page.locator(selector).count();
              if (components > 0) {
                visibleComponents = components;
                console.log(`📊 Found ${components} components with selector: ${selector}`);
                break;
              }
            }
            
            console.log(`📊 ${testType} -> ${visibleComponents} visible components`);
            
            // Check if filtering is working by looking for specific components
            const componentTexts = [];
            const componentElements = await page.locator('button[role="button"], h3[role="button"], h2[role="button"]').all();
            
            for (const element of componentElements) {
              const text = await element.textContent();
              if (text && text.trim()) {
                componentTexts.push(text.trim());
              }
            }
            
            console.log(`📋 Available components for ${testType}:`, componentTexts.slice(0, 10));
            
            // Close picker
            const closeButton = page.locator('button[aria-label*="Close"], button:has-text("Cancel"), [data-testid*="close"]').first();
            if (await closeButton.isVisible()) {
              await closeButton.click();
              await page.waitForTimeout(500);
            } else {
              // Try pressing Escape
              await page.keyboard.press('Escape');
              await page.waitForTimeout(500);
            }
            
          } else {
            console.log(`❌ No add component button found for ${testType}`);
          }
        }
        
      } else {
        console.log('❌ ListingType field not found');
      }
    } else {
      console.log('❌ No items found to test');
    }
    
    // Summary
    console.log('\n📋 Console logs from plugin:');
    consoleLogs.forEach(log => console.log(`  - ${log}`));
    
    console.log(`\n📊 Total plugin-related logs: ${consoleLogs.length}`);
    
    if (consoleLogs.some(log => log.includes('component picker detected') || log.includes('filtering'))) {
      console.log('🎉 SUCCESS: Enhanced Filter is working!');
    } else {
      console.log('⚠️ Enhanced Filter may not be triggering properly');
    }
  });

  test('Direct API Test for Component Filtering', async ({ page }) => {
    console.log('🔌 Testing component filtering API directly...');
    
    // Test different listing types
    const testCases = [
      { id: 19, name: 'Scammer' },
      { id: 20, name: 'Bank' },
      { id: 21, name: 'Business' }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n🧪 Testing Listing Type: ${testCase.name} (ID: ${testCase.id})`);
      
      const response = await page.request.get(`http://localhost:1337/api/smart-component-filter/listing-type/${testCase.id}/components`);
      console.log(`📊 API Status: ${response.status()}`);
      
      if (response.ok()) {
        const data = await response.json();
        console.log(`✅ ${testCase.name}:`, {
          success: data.success,
          componentCount: data.data?.totalCount || 0,
          components: data.data?.allowedComponents?.slice(0, 5) || []
        });
      } else {
        console.log(`❌ ${testCase.name}: API call failed`);
      }
    }
  });
}); 