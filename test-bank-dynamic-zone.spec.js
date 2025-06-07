const { test, expect } = require('@playwright/test');

test.describe('🏦 Bank Dynamic Zone Filter Test', () => {
  test('Test Enhanced Filter with Bank Listing Type', async ({ page }) => {
    console.log('🚀 Testing Enhanced Filter with Bank listing type...');
    
    // Setup console logging
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Smart Component Filter') || 
          text.includes('🎯') || text.includes('✅') || text.includes('❌') ||
          text.includes('filtering') || text.includes('component picker') ||
          text.includes('Found') || text.includes('Bank')) {
        consoleLogs.push(text);
        console.log(`🖥️ Browser: ${text}`);
      }
    });
    
    // Login first
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
    
    // Go directly to a specific item
    const itemId = 'f98zymeazmd6zcqhdoaruftk';
    const directUrl = `http://localhost:1337/admin/content-manager/collection-types/api::item.item/${itemId}`;
    
    console.log(`📝 Navigating directly to item: ${itemId}`);
    await page.goto(directUrl);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-bank-item-page.png' });
    
    // Wait for plugin to initialize
    await page.waitForTimeout(2000);
    
    // Find the relation field
    const relationField = page.locator('input[name="ListingType"]').first();
    
    if (await relationField.isVisible()) {
      console.log('✅ Found ListingType relation field');
      
      // Click to open dropdown
      console.log('🔄 Opening relation dropdown...');
      await relationField.click();
      await page.waitForTimeout(1000);
      
      // Look for Bank option (we know it's visible from debug)
      const bankOption = page.locator('[role="listbox"] >> text=Bank').first();
      
      if (await bankOption.isVisible()) {
        console.log('✅ Found Bank option, selecting it...');
        await bankOption.click();
        await page.waitForTimeout(1000);
        
        // Verify selection
        const newValue = await relationField.inputValue();
        console.log(`📊 New relation value: "${newValue}"`);
        
        // Test API call for Bank (ID: 7 based on our findings)
        console.log('\n🧪 Testing Bank API call...');
        const response = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/7/components');
        console.log(`📊 Bank API Status: ${response.status()}`);
        
        if (response.ok()) {
          const data = await response.json();
          console.log(`✅ Bank API Response:`, {
            success: data.success,
            componentCount: data.data?.totalCount || 0,
            components: data.data?.allowedComponents?.slice(0, 8) || []
          });
        }
        
        // Now look for Dynamic Zone add buttons
        const addButtonSelectors = [
          'button:has-text("Add a component")',
          'button:has-text("Add component")',
          'button[aria-label*="Add"]',
          'button[title*="Add"]',
          'button:has-text("+")',
          '[data-testid*="add"]',
          '[class*="add"][class*="component"]'
        ];
        
        let addButton = null;
        for (const selector of addButtonSelectors) {
          const button = page.locator(selector).first();
          if (await button.isVisible()) {
            addButton = button;
            console.log(`✅ Found add component button: ${selector}`);
            break;
          }
        }
        
        if (addButton) {
          console.log('🎯 Opening component picker after selecting Bank...');
          await addButton.click();
          await page.waitForTimeout(3000); // Wait for picker and filtering
          
          await page.screenshot({ path: 'test-component-picker-bank.png' });
          
          // Check what components are visible
          const componentElements = await page.locator('button[role="button"], h3[role="button"], h2[role="button"], [data-testid*="component"]').all();
          
          console.log(`📊 Found ${componentElements.length} component elements`);
          
          const visibleComponents = [];
          for (const element of componentElements) {
            const text = await element.textContent();
            const isVisible = await element.isVisible();
            if (text && text.trim() && isVisible) {
              visibleComponents.push(text.trim());
            }
          }
          
          console.log(`📋 Visible components (${visibleComponents.length}):`, visibleComponents);
          
          // Check if we have the expected Bank components
          const expectedBankComponents = ['contact', 'basic', 'location', 'company'];
          const foundExpectedComponents = expectedBankComponents.filter(comp => 
            visibleComponents.some(visible => 
              visible.toLowerCase().includes(comp.toLowerCase())
            )
          );
          
          console.log(`📊 Expected Bank-related components found: ${foundExpectedComponents.length}/${expectedBankComponents.length}`);
          console.log(`📋 Found components:`, foundExpectedComponents);
          
          if (foundExpectedComponents.length > 0) {
            console.log('🎉 SUCCESS: Enhanced Filter is working with Bank listing type!');
          } else {
            console.log('⚠️ Enhanced Filter may not be filtering correctly');
          }
          
          // Close picker
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          
        } else {
          console.log('❌ No add component button found');
          
          // Debug: List all buttons
          const allButtons = await page.locator('button').all();
          console.log(`📊 Found ${allButtons.length} buttons on page`);
          
          for (let i = 0; i < Math.min(allButtons.length, 15); i++) {
            const text = await allButtons[i].textContent();
            const isVisible = await allButtons[i].isVisible();
            if (text && text.trim()) {
              console.log(`  - Button ${i + 1}: "${text.trim()}" (visible: ${isVisible})`);
            }
          }
        }
        
      } else {
        console.log('❌ Bank option not found in dropdown');
        
        // Try typing "Bank" directly
        console.log('🔍 Trying to type "Bank" directly...');
        await relationField.fill('Bank');
        await page.waitForTimeout(1000);
        
        // Look for suggestions
        const suggestions = await page.locator('[role="option"], [role="listbox"] li').all();
        console.log(`📊 Found ${suggestions.length} suggestions after typing Bank`);
        
        for (let i = 0; i < Math.min(suggestions.length, 5); i++) {
          const text = await suggestions[i].textContent();
          if (text && text.includes('Bank')) {
            console.log(`  - Bank suggestion ${i + 1}: "${text.trim()}"`);
            // Try clicking this suggestion
            await suggestions[i].click();
            await page.waitForTimeout(1000);
            break;
          }
        }
      }
      
    } else {
      console.log('❌ ListingType relation field not found');
    }
    
    // Summary
    console.log('\n📋 Plugin activity summary:');
    consoleLogs.forEach(log => console.log(`  - ${log}`));
    
    const hasFilteringActivity = consoleLogs.some(log => 
      log.includes('component picker detected') || 
      log.includes('filtering') ||
      log.includes('Found item ID') ||
      log.includes('Found listing type') ||
      log.includes('Bank')
    );
    
    console.log(`\n📊 Enhanced Filter activity detected: ${hasFilteringActivity}`);
  });
}); 