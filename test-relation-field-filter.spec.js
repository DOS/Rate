const { test, expect } = require('@playwright/test');

test.describe('🎯 Relation Field Enhanced Filter Test', () => {
  test('Test Enhanced Filter with Relation Field', async ({ page }) => {
    console.log('🚀 Testing Enhanced Filter with relation field...');
    
    // Setup console logging
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Smart Component Filter') || 
          text.includes('🎯') || text.includes('✅') || text.includes('❌') ||
          text.includes('filtering') || text.includes('component picker') ||
          text.includes('Found') || text.includes('relation')) {
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
    await page.screenshot({ path: 'test-relation-field-page.png' });
    
    // Wait for plugin to initialize
    await page.waitForTimeout(2000);
    
    // Find the relation field
    const relationSelectors = [
      'input[name="ListingType"]',
      '[name="ListingType"]',
      'input[type="relation"]',
      'input[role="combobox"][name="ListingType"]'
    ];
    
    let relationField = null;
    for (const selector of relationSelectors) {
      const field = page.locator(selector).first();
      if (await field.isVisible()) {
        relationField = field;
        console.log(`✅ Found ListingType relation field with selector: ${selector}`);
        break;
      }
    }
    
    if (relationField) {
      // Check current value
      const currentValue = await relationField.inputValue();
      console.log(`📊 Current relation value: "${currentValue}"`);
      
      // Click on the relation field to open dropdown
      console.log('🔄 Opening relation dropdown...');
      await relationField.click();
      await page.waitForTimeout(1000);
      
      // Look for Scammer option in dropdown
      const scammerOption = page.locator('text=Scammer, li:has-text("Scammer"), button:has-text("Scammer"), [role="option"]:has-text("Scammer")').first();
      
      if (await scammerOption.isVisible()) {
        console.log('✅ Found Scammer option, selecting it...');
        await scammerOption.click();
        await page.waitForTimeout(1000);
        
        // Verify selection
        const newValue = await relationField.inputValue();
        console.log(`📊 New relation value: "${newValue}"`);
        
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
          console.log('🎯 Opening component picker after selecting Scammer...');
          await addButton.click();
          await page.waitForTimeout(3000); // Wait for picker and filtering
          
          await page.screenshot({ path: 'test-component-picker-scammer-relation.png' });
          
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
          const expectedScammerComponents = ['contact', 'violation', 'social'];
          const foundExpectedComponents = expectedScammerComponents.filter(comp => 
            visibleComponents.some(visible => 
              visible.toLowerCase().includes(comp.toLowerCase())
            )
          );
          
          console.log(`📊 Expected Scammer-related components found: ${foundExpectedComponents.length}/${expectedScammerComponents.length}`);
          console.log(`📋 Found components:`, foundExpectedComponents);
          
          if (foundExpectedComponents.length > 0) {
            console.log('🎉 SUCCESS: Enhanced Filter is working with relation field!');
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
        console.log('❌ Scammer option not found in dropdown');
        
        // Debug: show available options
        const allOptions = await page.locator('[role="option"], li, button').all();
        console.log(`📊 Found ${allOptions.length} potential options`);
        
        for (let i = 0; i < Math.min(allOptions.length, 10); i++) {
          const text = await allOptions[i].textContent();
          if (text && text.trim()) {
            console.log(`  - Option ${i + 1}: "${text.trim()}"`);
          }
        }
      }
      
    } else {
      console.log('❌ ListingType relation field not found');
      
      // Debug: show all input elements
      const allInputs = await page.locator('input').all();
      console.log(`📊 Found ${allInputs.length} input elements`);
      
      for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
        const name = await allInputs[i].getAttribute('name');
        const type = await allInputs[i].getAttribute('type');
        const role = await allInputs[i].getAttribute('role');
        console.log(`  - Input ${i + 1}: name="${name}", type="${type}", role="${role}"`);
      }
    }
    
    // Summary
    console.log('\n📋 Plugin activity summary:');
    consoleLogs.forEach(log => console.log(`  - ${log}`));
    
    const hasFilteringActivity = consoleLogs.some(log => 
      log.includes('component picker detected') || 
      log.includes('filtering') ||
      log.includes('Found item ID') ||
      log.includes('Found listing type') ||
      log.includes('relation')
    );
    
    console.log(`\n📊 Enhanced Filter activity detected: ${hasFilteringActivity}`);
  });
}); 