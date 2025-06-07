const { test, expect } = require('@playwright/test');

test.describe('Debug Seller Filtering - Improved', () => {
  test('should debug Seller filtering with better selectors', async ({ page }) => {
    console.log('🧪 Debugging Seller filtering with improved selectors...');
    
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
          text.includes('❌') ||
          text.includes('22') ||
          text.includes('Seller')) {
        logs.push(text);
        console.log('📋 Console:', text);
      }
    });
    
    // Wait for page to load completely
    await page.waitForTimeout(3000);
    
    console.log('🔍 Searching for all possible ListingType field selectors...');
    
    // Try multiple selectors for ListingType field
    const selectors = [
      'input[name*="ListingType"]',
      'input[name*="listingType"]', 
      'input[name*="listing_type"]',
      'button[aria-label*="ListingType"]',
      'button[aria-label*="Listing Type"]',
      '[data-testid*="listing"]',
      '[data-testid*="ListingType"]',
      'div:has-text("ListingType") input',
      'div:has-text("Listing Type") input',
      'div:has-text("ListingType") button',
      'div:has-text("Listing Type") button'
    ];
    
    let listingTypeField = null;
    
    for (const selector of selectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        console.log(`✅ Found ListingType field with selector: ${selector}`);
        listingTypeField = element;
        break;
      }
    }
    
    if (!listingTypeField) {
      console.log('❌ ListingType field not found with any selector');
      
      // Debug: Show all form fields
      console.log('🔍 Listing all form fields for debugging...');
      const allInputs = await page.locator('input, button[role="combobox"], button[aria-haspopup="listbox"]').all();
      
      for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
        const input = allInputs[i];
        const name = await input.getAttribute('name') || '';
        const placeholder = await input.getAttribute('placeholder') || '';
        const ariaLabel = await input.getAttribute('aria-label') || '';
        const text = await input.textContent() || '';
        
        console.log(`📋 Field ${i}: name="${name}", placeholder="${placeholder}", aria-label="${ariaLabel}", text="${text}"`);
      }
      
      // Take screenshot for debugging
      await page.screenshot({ path: 'debug-no-listing-field.png', fullPage: true });
      return;
    }
    
    // Click the ListingType field
    console.log('✅ Clicking ListingType field...');
    await listingTypeField.click();
    await page.waitForTimeout(1000);
    
    // Look for dropdown options
    console.log('🔍 Looking for dropdown options...');
    const dropdownSelectors = [
      '[role="option"]',
      '[role="menuitem"]', 
      'button[role="option"]',
      'div[role="option"]',
      'li[role="option"]',
      'button:has-text("Seller")',
      'div:has-text("Seller")',
      '[data-value*="22"]'
    ];
    
    let sellerOption = null;
    
    for (const selector of dropdownSelectors) {
      const options = page.locator(selector);
      const count = await options.count();
      
      if (count > 0) {
        console.log(`📋 Found ${count} options with selector: ${selector}`);
        
        // Look for Seller specifically
        const seller = options.filter({ hasText: 'Seller' }).first();
        if (await seller.isVisible()) {
          console.log(`✅ Found Seller option with selector: ${selector}`);
          sellerOption = seller;
          break;
        }
      }
    }
    
    if (!sellerOption) {
      console.log('❌ Seller option not found');
      
      // List all available options
      const allOptions = await page.locator('[role="option"], [role="menuitem"], button[role="option"]').allTextContents();
      console.log('📋 All available options:', allOptions);
      
      await page.screenshot({ path: 'debug-no-seller-option.png', fullPage: true });
      return;
    }
    
    // Click Seller option
    console.log('✅ Clicking Seller option...');
    await sellerOption.click();
    await page.waitForTimeout(2000);
    
    // Check if plugin detected the selection
    const hasSellerLogs = logs.some(log => log.includes('22') || log.includes('Seller'));
    console.log('📊 Plugin detected Seller selection:', hasSellerLogs);
    
    if (!hasSellerLogs) {
      console.log('⚠️ Plugin did not detect Seller selection - this is the issue!');
    }
    
    // Now check Dynamic Zone
    console.log('🔍 Looking for Dynamic Zone...');
    const dynamicZoneSelectors = [
      'button:has-text("Add a component")',
      'button:has-text("Add component")', 
      'button[aria-label*="Add"]',
      'button:has-text("Ajouter")',
      '[data-testid*="add-component"]',
      'button:has-text("+")'
    ];
    
    let dynamicZoneButton = null;
    
    for (const selector of dynamicZoneSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        console.log(`✅ Found Dynamic Zone button with selector: ${selector}`);
        dynamicZoneButton = element;
        break;
      }
    }
    
    if (!dynamicZoneButton) {
      console.log('❌ Dynamic Zone button not found');
      await page.screenshot({ path: 'debug-no-dynamic-zone.png', fullPage: true });
      return;
    }
    
    // Click Dynamic Zone button
    console.log('✅ Clicking Dynamic Zone button...');
    await dynamicZoneButton.click();
    await page.waitForTimeout(1000);
    
    // Count all visible components
    const componentSelectors = [
      '[role="button"]:has-text("contact.")',
      '[role="button"]:has-text("content.")', 
      '[role="button"]:has-text("violation.")',
      'button:has-text("contact.")',
      'button:has-text("content.")',
      'button:has-text("violation.")'
    ];
    
    let totalComponents = 0;
    for (const selector of componentSelectors) {
      const count = await page.locator(selector).count();
      totalComponents += count;
    }
    
    console.log('📊 Total visible components:', totalComponents);
    
    // Check for specific components that should be visible for Seller
    const expectedComponents = [
      'contact.basic',
      'contact.location', 
      'contact.social',
      'content.description',
      'content.media-gallery'
    ];
    
    for (const component of expectedComponents) {
      const isVisible = await page.locator(`button:has-text("${component}"), [role="button"]:has-text("${component}")`).isVisible();
      console.log(`📋 ${component}: ${isVisible ? '✅ Visible' : '❌ Hidden'}`);
    }
    
    // Check for components that should be hidden
    const shouldBeHidden = [
      'violation.report',
      'violation.evidence'
    ];
    
    for (const component of shouldBeHidden) {
      const isVisible = await page.locator(`button:has-text("${component}"), [role="button"]:has-text("${component}")`).isVisible();
      console.log(`📋 ${component}: ${isVisible ? '❌ Should be hidden but visible' : '✅ Correctly hidden'}`);
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'debug-seller-final-state.png', fullPage: true });
    
    console.log('🎯 Debug completed.');
    console.log('📋 All plugin logs:', logs);
    
    // If we see all components, the filtering is not working
    if (totalComponents > 5) {
      console.log('❌ ISSUE FOUND: Too many components visible, filtering not working!');
    } else {
      console.log('✅ Filtering appears to be working correctly');
    }
  });
}); 