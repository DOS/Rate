const { test, expect } = require('@playwright/test');

test.describe('Explore Form Structure', () => {
  test('Find actual field names and structure', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Smart Component Filter') || text.includes('🎯')) {
        console.log(`🎯 CONSOLE: ${text}`);
      }
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

    // Take screenshot
    await page.screenshot({ path: 'explore-form-structure.png' });

    // Find all form fields with data-strapi-field-name
    const fieldNames = await page.locator('[data-strapi-field-name]').all();
    console.log(`🔍 Found ${fieldNames.length} fields with data-strapi-field-name:`);
    
    for (let i = 0; i < fieldNames.length; i++) {
      const fieldName = await fieldNames[i].getAttribute('data-strapi-field-name');
      console.log(`  Field ${i + 1}: ${fieldName}`);
    }

    // Find all buttons and their text
    const buttons = await page.locator('button').all();
    console.log(`🔍 Found ${buttons.length} buttons:`);
    
    for (let i = 0; i < Math.min(buttons.length, 20); i++) {
      const buttonText = await buttons[i].textContent();
      if (buttonText && buttonText.trim()) {
        console.log(`  Button ${i + 1}: "${buttonText.trim()}"`);
      }
    }

    // Look for relation fields specifically
    const relationFields = await page.locator('[data-strapi-field-name*="Type"], [data-strapi-field-name*="type"], [data-strapi-field-name*="Listing"]').all();
    console.log(`🔍 Found ${relationFields.length} potential ListingType fields:`);
    
    for (let i = 0; i < relationFields.length; i++) {
      const fieldName = await relationFields[i].getAttribute('data-strapi-field-name');
      console.log(`  Relation Field ${i + 1}: ${fieldName}`);
    }

    // Look for Dynamic Zone fields
    const dynamicZoneFields = await page.locator('[data-strapi-field-name*="Field"], [data-strapi-field-name*="field"], [data-strapi-field-name*="Item"]').all();
    console.log(`🔍 Found ${dynamicZoneFields.length} potential Dynamic Zone fields:`);
    
    for (let i = 0; i < dynamicZoneFields.length; i++) {
      const fieldName = await dynamicZoneFields[i].getAttribute('data-strapi-field-name');
      console.log(`  Dynamic Zone Field ${i + 1}: ${fieldName}`);
    }

    // Look for any text containing "Bank" or "Scammer"
    const listingTypeElements = await page.locator('text=Bank, text=Scammer, text=Business').all();
    console.log(`🔍 Found ${listingTypeElements.length} elements with ListingType values`);

    // Check if there are any dropdowns or select elements
    const dropdowns = await page.locator('select, [role="combobox"], [role="listbox"]').all();
    console.log(`🔍 Found ${dropdowns.length} dropdown elements`);

    await page.waitForTimeout(10000); // Keep page open for inspection
  });

  test('Explore Form Structure with ListingType Selection', async ({ page }) => {
    console.log('🚀 Exploring form structure with ListingType selection...');
    
    // Login
    await page.goto('http://localhost:1337/admin/auth/login');
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin');
    console.log('✅ Logged in');
    
    // Navigate to create Item page
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    console.log('📋 On create Item page');
    
    // Wait for page to fully load
    await page.waitForTimeout(3000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'explore-form-initial.png', fullPage: true });
    console.log('📸 Initial screenshot taken');
    
    // Step 1: Find and select ListingType
    console.log('🎯 Step 1: Looking for ListingType field...');
    
    const listingTypeInput = await page.locator('input[name="ListingType"]').first();
    const isListingTypeVisible = await listingTypeInput.isVisible();
    console.log(`📊 ListingType input visible: ${isListingTypeVisible}`);
    
    if (isListingTypeVisible) {
      console.log('🎯 Clicking ListingType field...');
      await listingTypeInput.click();
      await page.waitForTimeout(1000);
      
      // Look for dropdown options
      const dropdownOptions = await page.locator('[role="option"], [data-testid*="option"], li').all();
      console.log(`📊 Found ${dropdownOptions.length} dropdown options`);
      
      // Look for Bank option
      let bankOption = null;
      for (let i = 0; i < dropdownOptions.length; i++) {
        const optionText = await dropdownOptions[i].textContent();
        console.log(`🔍 Option ${i + 1}: "${optionText}"`);
        
        if (optionText && optionText.toLowerCase().includes('bank')) {
          bankOption = dropdownOptions[i];
          console.log(`✅ Found Bank option: "${optionText}"`);
          break;
        }
      }
      
      if (bankOption) {
        console.log('🎯 Selecting Bank option...');
        await bankOption.click();
        await page.waitForTimeout(2000);
        
        // Take screenshot after selection
        await page.screenshot({ path: 'explore-after-bank-selection.png', fullPage: true });
        console.log('📸 Screenshot after Bank selection taken');
        
      } else {
        console.log('❌ Bank option not found in dropdown');
        
        // Try typing "Bank" instead
        console.log('🎯 Trying to type "Bank"...');
        await listingTypeInput.fill('Bank');
        await page.waitForTimeout(1000);
        
        // Press Enter or look for suggestions
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    } else {
      console.log('❌ ListingType input not visible');
    }
    
    // Step 2: Now look for FieldGroup after ListingType selection
    console.log('🎯 Step 2: Looking for FieldGroup after ListingType selection...');
    
    // Get all labels again
    const allLabels = await page.locator('label').all();
    console.log(`📊 Found ${allLabels.length} labels after ListingType selection`);
    
    let fieldGroupFound = false;
    for (let i = 0; i < allLabels.length; i++) {
      const labelText = await allLabels[i].textContent();
      console.log(`🏷️ Label ${i + 1}: "${labelText}"`);
      
      if (labelText && labelText.toLowerCase().includes('fieldgroup')) {
        fieldGroupFound = true;
        console.log(`✅ FieldGroup found: "${labelText}"`);
      }
    }
    
    if (!fieldGroupFound) {
      console.log('❌ FieldGroup still not found after ListingType selection');
      
      // Look for any dynamic zone related text
      const dynamicZoneSelectors = [
        'text=Dynamic Zone',
        'text=dynamic zone',
        'text=Add a component',
        'text=Add component',
        '*:has-text("Dynamic")',
        '*:has-text("component")',
        '*:has-text("zone")'
      ];
      
      for (const selector of dynamicZoneSelectors) {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`🔍 Found ${elements.length} elements with selector "${selector}"`);
          
          for (let i = 0; i < Math.min(elements.length, 3); i++) {
            const elementText = await elements[i].textContent();
            console.log(`  Element ${i + 1}: "${elementText}"`);
          }
        }
      }
    } else {
      // FieldGroup found, look for add component button
      console.log('🎯 FieldGroup found, looking for add component button...');
      
      const addButtonSelectors = [
        'button:has-text("Add a component")',
        'button:has-text("Add component")',
        'button:has-text("Choose component")',
        'button[aria-label*="component"]'
      ];
      
      let addButton = null;
      for (const selector of addButtonSelectors) {
        try {
          const button = await page.locator(selector).first();
          if (await button.isVisible()) {
            addButton = button;
            console.log(`✅ Found add button: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue
        }
      }
      
      if (addButton) {
        console.log('🎯 Clicking add component button...');
        await addButton.click();
        await page.waitForTimeout(2000);
        
        // Check for component picker dialog
        const dialogs = await page.locator('[role="dialog"]').all();
        console.log(`📊 Found ${dialogs.length} dialogs after click`);
        
        if (dialogs.length > 0) {
          console.log('🎉 SUCCESS: Component picker opened!');
          await page.screenshot({ path: 'explore-picker-success.png' });
        } else {
          console.log('❌ Component picker did not open');
          await page.screenshot({ path: 'explore-picker-failed.png' });
        }
      } else {
        console.log('❌ Add component button not found');
      }
    }
    
    console.log('✅ Form exploration completed');
  });
}); 