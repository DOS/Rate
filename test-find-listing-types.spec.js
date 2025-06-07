const { test, expect } = require('@playwright/test');

test.describe('🔍 Find Listing Types Debug', () => {
  test('Debug Listing Type Dropdown', async ({ page }) => {
    console.log('🔍 Debugging listing type dropdown...');
    
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
    
    // Go to listing types collection to see what's available
    console.log('📋 Checking Listing Types collection...');
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::listing-type.listing-type');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'debug-listing-types-collection.png' });
    
    // Get all listing types
    const listingTypeRows = await page.locator('tr, [data-testid="list-item"]').all();
    console.log(`📊 Found ${listingTypeRows.length} listing type rows`);
    
    const listingTypes = [];
    for (let i = 1; i < Math.min(listingTypeRows.length, 6); i++) { // Skip header
      const text = await listingTypeRows[i].textContent();
      if (text && text.trim()) {
        listingTypes.push(text.trim());
        console.log(`  - Listing Type ${i}: "${text.trim()}"`);
      }
    }
    
    // Now go to item edit page
    const itemId = 'f98zymeazmd6zcqhdoaruftk';
    const directUrl = `http://localhost:1337/admin/content-manager/collection-types/api::item.item/${itemId}`;
    
    console.log(`\n📝 Navigating to item: ${itemId}`);
    await page.goto(directUrl);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'debug-item-edit-page.png' });
    
    // Find the relation field
    const relationField = page.locator('input[name="ListingType"]').first();
    
    if (await relationField.isVisible()) {
      console.log('✅ Found ListingType relation field');
      
      // Check if there's already a selected value
      const currentValue = await relationField.inputValue();
      console.log(`📊 Current value: "${currentValue}"`);
      
      // Click to open dropdown
      console.log('🔄 Clicking relation field...');
      await relationField.click();
      await page.waitForTimeout(2000);
      
      await page.screenshot({ path: 'debug-relation-dropdown-opened.png' });
      
      // Try different strategies to find the dropdown
      const dropdownSelectors = [
        '[role="listbox"]',
        '[role="menu"]',
        '[data-testid*="dropdown"]',
        '[data-testid*="option"]',
        '.dropdown',
        '[class*="dropdown"]',
        '[class*="menu"]',
        '[class*="option"]'
      ];
      
      let dropdown = null;
      for (const selector of dropdownSelectors) {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          dropdown = element;
          console.log(`✅ Found dropdown with selector: ${selector}`);
          break;
        }
      }
      
      if (dropdown) {
        // Get all options in the dropdown
        const options = await dropdown.locator('li, [role="option"], button, div').all();
        console.log(`📊 Found ${options.length} options in dropdown`);
        
        for (let i = 0; i < Math.min(options.length, 15); i++) {
          const text = await options[i].textContent();
          if (text && text.trim()) {
            console.log(`  - Option ${i + 1}: "${text.trim()}"`);
          }
        }
        
        // Look specifically for listing type names
        const scammerOption = dropdown.locator('text=Scammer, li:has-text("Scammer"), [role="option"]:has-text("Scammer")').first();
        const bankOption = dropdown.locator('text=Bank, li:has-text("Bank"), [role="option"]:has-text("Bank")').first();
        const businessOption = dropdown.locator('text=Business, li:has-text("Business"), [role="option"]:has-text("Business")').first();
        
        console.log(`\n🔍 Specific listing type options:`);
        console.log(`  - Scammer visible: ${await scammerOption.isVisible()}`);
        console.log(`  - Bank visible: ${await bankOption.isVisible()}`);
        console.log(`  - Business visible: ${await businessOption.isVisible()}`);
        
        // Try to type to search
        console.log('\n🔍 Trying to type "Scammer" to search...');
        await relationField.fill('Scammer');
        await page.waitForTimeout(1000);
        
        await page.screenshot({ path: 'debug-relation-search-scammer.png' });
        
        // Check if options changed
        const searchOptions = await dropdown.locator('li, [role="option"], button, div').all();
        console.log(`📊 After search: ${searchOptions.length} options`);
        
        for (let i = 0; i < Math.min(searchOptions.length, 10); i++) {
          const text = await searchOptions[i].textContent();
          if (text && text.trim()) {
            console.log(`  - Search Option ${i + 1}: "${text.trim()}"`);
          }
        }
        
      } else {
        console.log('❌ No dropdown found');
        
        // Try to type directly in the field
        console.log('🔍 Trying to type directly in relation field...');
        await relationField.fill('Scammer');
        await page.waitForTimeout(1000);
        
        await page.screenshot({ path: 'debug-relation-direct-type.png' });
        
        // Check if any suggestions appear
        const suggestions = await page.locator('[role="option"], .suggestion, [class*="suggestion"]').all();
        console.log(`📊 Found ${suggestions.length} suggestions after typing`);
        
        for (let i = 0; i < suggestions.length; i++) {
          const text = await suggestions[i].textContent();
          if (text && text.trim()) {
            console.log(`  - Suggestion ${i + 1}: "${text.trim()}"`);
          }
        }
      }
      
      // Close dropdown
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      
    } else {
      console.log('❌ ListingType relation field not found');
    }
    
    console.log('\n📋 Available Listing Types from collection:', listingTypes);
  });
}); 