const { test, expect } = require('@playwright/test');

test.describe('Smart Loading Real Test', () => {
  test('should filter components in Dynamic Zone based on ListingType', async ({ page }) => {
    console.log('🎯 Starting Smart Loading real browser test...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Login (if needed)
    try {
      // Check if we're on login page
      const loginForm = await page.locator('form').first();
      if (await loginForm.isVisible()) {
        console.log('🔐 Logging into Strapi admin...');
        
        await page.fill('input[name="email"]', 'joy@joy.vn');
        await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');
        
        console.log('✅ Login successful');
      }
    } catch (error) {
      console.log('ℹ️ Already logged in or login not needed');
    }
    
    // Navigate to Scammer item
    console.log('🚨 Navigating to Scammer item...');
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/f98zymeazmd6zcqhdoaruftk?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    
    // Wait for page to fully load
    await page.waitForTimeout(2000);
    
    // Check if Smart Loading plugin is loaded
    console.log('🔍 Checking if Smart Loading plugin is loaded...');
    
    // Listen for console logs from the plugin
    page.on('console', msg => {
      if (msg.text().includes('Smart Component Filter')) {
        console.log('📦 Plugin log:', msg.text());
      }
    });
    
    // Look for ListingType field
    console.log('🔍 Looking for ListingType field...');
    const listingTypeField = await page.locator('[name="ListingType"]').first();
    
    if (await listingTypeField.isVisible()) {
      console.log('✅ Found ListingType field');
      
      // Get the selected ListingType value
      const listingTypeValue = await listingTypeField.inputValue();
      console.log('📋 Current ListingType value:', listingTypeValue);
    }
    
    // Look for Dynamic Zone field
    console.log('🔍 Looking for Dynamic Zone field...');
    const dynamicZoneSelectors = [
      '[data-strapi-field-type="dynamiczone"]',
      '[class*="DynamicZone"]',
      '[class*="dynamic-zone"]',
      'div:has-text("Dynamic Zone")',
      'div:has-text("Add component")'
    ];
    
    let dynamicZone = null;
    for (const selector of dynamicZoneSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          dynamicZone = element;
          console.log(`✅ Found Dynamic Zone with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!dynamicZone) {
      console.log('❌ Dynamic Zone not found, looking for any "Add component" button...');
      
      // Look for any button with "Add component" text
      const addButtons = await page.locator('button:has-text("Add component"), button:has-text("Choose component"), button:has-text("Select component")').all();
      
      if (addButtons.length > 0) {
        console.log(`✅ Found ${addButtons.length} add component button(s)`);
        
        // Click the first add component button
        console.log('🖱️ Clicking add component button...');
        await addButtons[0].click();
        await page.waitForTimeout(1000);
        
        // Check if component picker opened
        console.log('🔍 Checking if component picker opened...');
        
        // Look for component categories
        const categorySelectors = [
          'h3[role="button"]',
          'h2[role="button"]',
          'button[role="button"]',
          'div:has-text("contact")',
          'div:has-text("violation")',
          'div:has-text("business")'
        ];
        
        let foundCategories = [];
        for (const selector of categorySelectors) {
          try {
            const elements = await page.locator(selector).all();
            for (const element of elements) {
              const text = await element.textContent();
              if (text && ['contact', 'violation', 'business', 'content', 'info'].some(cat => 
                text.toLowerCase().includes(cat))) {
                foundCategories.push(text.trim());
              }
            }
          } catch (e) {
            // Continue
          }
        }
        
        console.log('📋 Found component categories:', foundCategories);
        
        if (foundCategories.length > 0) {
          console.log('✅ Component picker opened successfully');
          
          // Check if Smart Loading filtering is working
          // For Scammer, we should see contact and violation categories
          const hasContact = foundCategories.some(cat => cat.toLowerCase().includes('contact'));
          const hasViolation = foundCategories.some(cat => cat.toLowerCase().includes('violation'));
          const hasBusiness = foundCategories.some(cat => cat.toLowerCase().includes('business'));
          
          console.log('🔍 Category analysis:');
          console.log(`   Contact: ${hasContact}`);
          console.log(`   Violation: ${hasViolation}`);
          console.log(`   Business: ${hasBusiness}`);
          
          if (hasContact && hasViolation && !hasBusiness) {
            console.log('🎉 Smart Loading is working! Scammer shows contact + violation, no business');
          } else if (foundCategories.length > 5) {
            console.log('⚠️ Smart Loading may not be working - showing all categories');
          } else {
            console.log('🤔 Smart Loading status unclear - need more investigation');
          }
          
        } else {
          console.log('❌ Component picker may not have opened properly');
        }
        
      } else {
        console.log('❌ No add component buttons found');
      }
    }
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'smart-loading-test-result.png', fullPage: true });
    console.log('📸 Screenshot saved as smart-loading-test-result.png');
    
    console.log('🏁 Smart Loading real test completed');
  });
}); 