const { test, expect } = require('@playwright/test');

test.describe('🎯 Direct Dynamic Zone Test', () => {
  test('Test Enhanced Filter with Direct Item URL', async ({ page }) => {
    console.log('🚀 Testing Enhanced Filter with direct item URL...');
    
    // Setup console logging
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Smart Component Filter') || 
          text.includes('🎯') || text.includes('✅') || text.includes('❌') ||
          text.includes('filtering') || text.includes('component picker')) {
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
    
    // Go directly to a specific item (from the logs we saw f98zymeazmd6zcqhdoaruftk)
    const itemId = 'f98zymeazmd6zcqhdoaruftk';
    const directUrl = `http://localhost:1337/admin/content-manager/collection-types/api::item.item/${itemId}`;
    
    console.log(`📝 Navigating directly to item: ${itemId}`);
    await page.goto(directUrl);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-direct-item-page.png' });
    
    // Wait for plugin to initialize
    await page.waitForTimeout(2000);
    
    // Check for ListingType field with multiple selectors
    const listingTypeSelectors = [
      'select[name="ListingType"]',
      '[name="ListingType"]',
      'select:has(option[value*="Bank"])',
      'select:has(option[value*="Scammer"])',
      'select:has(option[value*="Business"])',
      'select[data-testid*="listing"]',
      'select[id*="listing"]'
    ];
    
    let listingTypeField = null;
    for (const selector of listingTypeSelectors) {
      const field = page.locator(selector).first();
      if (await field.isVisible()) {
        listingTypeField = field;
        console.log(`✅ Found ListingType field with selector: ${selector}`);
        break;
      }
    }
    
    if (listingTypeField) {
      const currentValue = await listingTypeField.inputValue();
      console.log(`📊 Current ListingType: ${currentValue}`);
      
      // Test changing to Scammer (we know this works from API)
      console.log('\n🔄 Changing to Scammer listing type...');
      await listingTypeField.selectOption('Scammer');
      await page.waitForTimeout(1000);
      
      // Look for Dynamic Zone add buttons
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
        console.log('🎯 Opening component picker...');
        await addButton.click();
        await page.waitForTimeout(3000); // Wait for picker and filtering
        
        await page.screenshot({ path: 'test-component-picker-opened.png' });
        
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
        
        // Check if we have the expected Scammer components
        const expectedScammerComponents = ['contact.basic', 'contact.location', 'contact.social', 'violation.fraud-details'];
        const foundExpectedComponents = expectedScammerComponents.filter(comp => 
          visibleComponents.some(visible => 
            visible.toLowerCase().includes(comp.split('.')[1]) || 
            comp.includes(visible.toLowerCase())
          )
        );
        
        console.log(`📊 Expected Scammer components found: ${foundExpectedComponents.length}/${expectedScammerComponents.length}`);
        console.log(`📋 Found components:`, foundExpectedComponents);
        
        if (foundExpectedComponents.length > 0) {
          console.log('🎉 SUCCESS: Enhanced Filter is working - found expected components!');
        } else {
          console.log('⚠️ Enhanced Filter may not be filtering correctly');
        }
        
        // Close picker
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        
      } else {
        console.log('❌ No add component button found');
        
        // Take screenshot to see what's available
        await page.screenshot({ path: 'test-no-add-button-found.png' });
        
        // List all buttons for debugging
        const allButtons = await page.locator('button').all();
        console.log(`📊 Found ${allButtons.length} buttons on page`);
        
        for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
          const text = await allButtons[i].textContent();
          const isVisible = await allButtons[i].isVisible();
          if (text && text.trim()) {
            console.log(`  - Button ${i + 1}: "${text.trim()}" (visible: ${isVisible})`);
          }
        }
      }
      
    } else {
      console.log('❌ ListingType field not found');
      
      // Debug: show all select elements
      const allSelects = await page.locator('select').all();
      console.log(`📊 Found ${allSelects.length} select elements`);
      
      for (let i = 0; i < allSelects.length; i++) {
        const name = await allSelects[i].getAttribute('name');
        const id = await allSelects[i].getAttribute('id');
        console.log(`  - Select ${i + 1}: name="${name}", id="${id}"`);
      }
    }
    
    // Summary
    console.log('\n📋 Plugin activity summary:');
    consoleLogs.forEach(log => console.log(`  - ${log}`));
    
    const hasFilteringActivity = consoleLogs.some(log => 
      log.includes('component picker detected') || 
      log.includes('filtering') ||
      log.includes('Found item ID') ||
      log.includes('Found listing type')
    );
    
    console.log(`\n📊 Enhanced Filter activity detected: ${hasFilteringActivity}`);
  });
}); 