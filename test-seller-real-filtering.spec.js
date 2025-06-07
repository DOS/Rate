const { test, expect } = require('@playwright/test');

test.describe('Real Seller Filtering Test', () => {
  test('should test actual Seller filtering in browser', async ({ page }) => {
    console.log('🧪 Testing real Seller filtering in browser...');
    
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
    
    // Listen to console logs
    const logs = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('Plugin Version') || 
          text.includes('Seller') || 
          text.includes('22') ||
          text.includes('🎯') ||
          text.includes('✅') ||
          text.includes('❌') ||
          text.includes('Dynamic Detection') ||
          text.includes('filtering')) {
        console.log('📋 Console:', text);
      }
    });
    
    // Wait for plugin to load
    await page.waitForTimeout(3000);
    
    // Check plugin version
    const versionLog = logs.find(log => log.includes('Plugin Version'));
    if (versionLog) {
      console.log('✅ Plugin loaded:', versionLog);
      expect(versionLog).toContain('1.0.5');
      expect(versionLog).toContain('Dynamic Detection');
    } else {
      console.log('❌ Plugin version not found in logs');
    }
    
    // Try to find and interact with ListingType field
    console.log('🔍 Looking for ListingType field...');
    
    // Wait a bit more for the form to fully load
    await page.waitForTimeout(2000);
    
    // Try different strategies to find the ListingType field
    const strategies = [
      async () => {
        // Strategy 1: Look for relation field by text content
        const labels = await page.locator('label, span, div').filter({ hasText: /ListingType|Listing Type/i }).all();
        for (const label of labels) {
          const container = label.locator('..').first();
          const input = container.locator('input, button[role="combobox"]').first();
          if (await input.isVisible()) {
            console.log('✅ Found ListingType field via label');
            return input;
          }
        }
        return null;
      },
      
      async () => {
        // Strategy 2: Look for combobox buttons
        const comboboxes = await page.locator('button[role="combobox"]').all();
        for (const combo of comboboxes) {
          const ariaLabel = await combo.getAttribute('aria-label') || '';
          const text = await combo.textContent() || '';
          if (ariaLabel.includes('ListingType') || text.includes('ListingType')) {
            console.log('✅ Found ListingType field via combobox');
            return combo;
          }
        }
        return null;
      },
      
      async () => {
        // Strategy 3: Look for any input/button near "ListingType" text
        const elements = await page.locator('input, button').all();
        for (const element of elements) {
          const container = element.locator('../..').first();
          const containerText = await container.textContent() || '';
          if (containerText.includes('ListingType')) {
            console.log('✅ Found ListingType field via container text');
            return element;
          }
        }
        return null;
      }
    ];
    
    let listingTypeField = null;
    
    for (let i = 0; i < strategies.length; i++) {
      console.log(`🔍 Trying strategy ${i + 1}...`);
      listingTypeField = await strategies[i]();
      if (listingTypeField) break;
    }
    
    if (!listingTypeField) {
      console.log('❌ Could not find ListingType field');
      await page.screenshot({ path: 'debug-no-listing-field-real.png', fullPage: true });
      
      // Debug: List all form elements
      const allInputs = await page.locator('input, button[role="combobox"], select').all();
      console.log(`📋 Found ${allInputs.length} form elements`);
      
      for (let i = 0; i < Math.min(allInputs.length, 5); i++) {
        const element = allInputs[i];
        const tagName = await element.evaluate(el => el.tagName);
        const type = await element.getAttribute('type') || '';
        const name = await element.getAttribute('name') || '';
        const placeholder = await element.getAttribute('placeholder') || '';
        const ariaLabel = await element.getAttribute('aria-label') || '';
        
        console.log(`📋 Element ${i}: ${tagName} type="${type}" name="${name}" placeholder="${placeholder}" aria-label="${ariaLabel}"`);
      }
      
      return;
    }
    
    // Click the ListingType field
    console.log('✅ Clicking ListingType field...');
    await listingTypeField.click();
    await page.waitForTimeout(1000);
    
    // Look for Seller option in dropdown
    console.log('🔍 Looking for Seller option...');
    
    const sellerSelectors = [
      'text=Seller',
      '[role="option"]:has-text("Seller")',
      'button:has-text("Seller")',
      'div:has-text("Seller")',
      'li:has-text("Seller")'
    ];
    
    let sellerOption = null;
    
    for (const selector of sellerSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        console.log(`✅ Found Seller option with selector: ${selector}`);
        sellerOption = element;
        break;
      }
    }
    
    if (!sellerOption) {
      console.log('❌ Seller option not found');
      
      // List all visible options
      const allOptions = await page.locator('[role="option"], button[role="menuitem"]').allTextContents();
      console.log('📋 Available options:', allOptions);
      
      await page.screenshot({ path: 'debug-no-seller-option-real.png', fullPage: true });
      return;
    }
    
    // Click Seller option
    console.log('✅ Clicking Seller option...');
    await sellerOption.click();
    await page.waitForTimeout(2000);
    
    // Check if plugin detected Seller selection
    const sellerLogs = logs.filter(log => log.includes('Seller') || log.includes('22'));
    console.log('📊 Plugin logs about Seller:', sellerLogs.length);
    
    if (sellerLogs.length > 0) {
      console.log('✅ Plugin detected Seller selection');
      sellerLogs.forEach(log => console.log('  📋', log));
    } else {
      console.log('⚠️ Plugin may not have detected Seller selection yet');
    }
    
    // Now test Dynamic Zone
    console.log('🔍 Looking for Dynamic Zone...');
    
    const dynamicZoneSelectors = [
      'button:has-text("Add a component")',
      'button:has-text("Add component")',
      'button[aria-label*="Add"]',
      '[data-testid*="add-component"]',
      'button:has-text("+")',
      'button:has-text("Ajouter")'
    ];
    
    let dynamicZoneButton = null;
    
    for (const selector of dynamicZoneSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        console.log(`✅ Found Dynamic Zone button: ${selector}`);
        dynamicZoneButton = element;
        break;
      }
    }
    
    if (!dynamicZoneButton) {
      console.log('❌ Dynamic Zone button not found');
      await page.screenshot({ path: 'debug-no-dynamic-zone-real.png', fullPage: true });
      return;
    }
    
    // Click Dynamic Zone button
    console.log('✅ Clicking Dynamic Zone button...');
    await dynamicZoneButton.click();
    await page.waitForTimeout(1500);
    
    // Count visible components
    const componentButtons = await page.locator('button:has-text("contact."), button:has-text("content."), button:has-text("violation.")').all();
    console.log('📊 Total visible components:', componentButtons.length);
    
    // Check specific components for Seller
    const expectedVisible = [
      'contact.basic',
      'contact.location',
      'contact.social',
      'content.description',
      'content.media-gallery'
    ];
    
    const shouldBeHidden = [
      'violation.report',
      'violation.evidence'
    ];
    
    console.log('🔍 Checking expected visible components...');
    for (const component of expectedVisible) {
      const isVisible = await page.locator(`button:has-text("${component}")`).isVisible();
      console.log(`📋 ${component}: ${isVisible ? '✅ Visible' : '❌ Hidden'}`);
    }
    
    console.log('🔍 Checking components that should be hidden...');
    for (const component of shouldBeHidden) {
      const isVisible = await page.locator(`button:has-text("${component}")`).isVisible();
      console.log(`📋 ${component}: ${isVisible ? '❌ Should be hidden but visible' : '✅ Correctly hidden'}`);
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'test-seller-real-filtering-final.png', fullPage: true });
    
    // Final assessment
    if (componentButtons.length <= 5) {
      console.log('✅ SUCCESS: Seller filtering appears to be working! Only 5 or fewer components visible.');
    } else {
      console.log(`❌ ISSUE: Too many components visible (${componentButtons.length}). Filtering may not be working.`);
    }
    
    console.log('🎯 Real Seller filtering test completed!');
  });
}); 