const { test, expect } = require('@playwright/test');

test.describe('Debug ListingType 14 Detection', () => {
  test('should debug plugin behavior with ListingType ID 14', async ({ page }) => {
    console.log('🧪 Debugging ListingType ID 14 detection...');
    
    // Listen for console logs from the page
    page.on('console', msg => {
      if (msg.text().includes('Smart Component Filter') || 
          msg.text().includes('🔍') || 
          msg.text().includes('📦') ||
          msg.text().includes('✅') ||
          msg.text().includes('❌') ||
          msg.text().includes('🚫')) {
        console.log(`[BROWSER] ${msg.text()}`);
      }
    });
    
    // Listen for API calls
    const apiCalls = [];
    page.on('response', response => {
      if (response.url().includes('/api/smart-component-filter/listing-type/')) {
        apiCalls.push({
          url: response.url(),
          status: response.status()
        });
        console.log(`[API] ${response.url()} - Status: ${response.status()}`);
      }
    });
    
    // Navigate to Strapi admin and login
    console.log('🔍 Step 1: Login to Strapi admin');
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Login
    const loginButton = page.locator('button[type="submit"]');
    if (await loginButton.isVisible()) {
      console.log('🔐 Logging in...');
      await page.fill('input[name="email"]', 'admin@example.com');
      await page.fill('input[name="password"]', 'password123');
      await loginButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    }
    
    // Navigate to item creation
    console.log('🔍 Step 2: Navigate to item creation');
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: 'debug-listingtype-14-initial.png', fullPage: true });
    console.log('📸 Initial screenshot saved');
    
    // Find ListingType field by looking for the label
    console.log('🔍 Step 3: Find ListingType field');
    
    // Look for label containing "ListingType"
    const listingTypeLabel = page.locator('label').filter({ hasText: /ListingType/i });
    
    if (await listingTypeLabel.isVisible()) {
      console.log('✅ Found ListingType label');
      
      // Find the input field associated with this label
      const fieldContainer = listingTypeLabel.locator('xpath=../..'); // Go up to container
      const inputField = fieldContainer.locator('input, [role="combobox"]').first();
      
      if (await inputField.isVisible()) {
        console.log('✅ Found ListingType input field');
        
        // Click to open dropdown
        console.log('🔍 Step 4: Click ListingType field');
        await inputField.click();
        await page.waitForTimeout(2000);
        
        // Take screenshot after clicking
        await page.screenshot({ path: 'debug-listingtype-14-dropdown.png', fullPage: true });
        console.log('📸 Dropdown screenshot saved');
        
        // Look for "Test CSS Variables Theme" option
        const testOption = page.locator('[role="option"]').filter({ hasText: /Test CSS Variables Theme/i });
        
        if (await testOption.isVisible()) {
          console.log('✅ Found "Test CSS Variables Theme" option');
          
          // Click the option
          console.log('🔍 Step 5: Select "Test CSS Variables Theme"');
          await testOption.click();
          await page.waitForTimeout(3000); // Wait longer for plugin to process
          
          // Take screenshot after selection
          await page.screenshot({ path: 'debug-listingtype-14-selected.png', fullPage: true });
          console.log('📸 Selection screenshot saved');
          
          // Check API calls made
          console.log(`📊 API calls made: ${apiCalls.length}`);
          apiCalls.forEach((call, index) => {
            console.log(`   ${index + 1}. ${call.url} - ${call.status}`);
          });
          
          // Look for FieldGroup section
          console.log('🔍 Step 6: Look for FieldGroup section');
          await page.waitForTimeout(2000);
          
          // Try different selectors for the add component button
          const buttonSelectors = [
            'button:has-text("Add a component to FieldGroup")',
            'button:has-text("Add component")',
            'button:has-text("FieldGroup")',
            '[data-testid*="add-component"]',
            'button[aria-label*="component"]'
          ];
          
          let addButton = null;
          for (const selector of buttonSelectors) {
            const button = page.locator(selector);
            if (await button.isVisible()) {
              console.log(`✅ Found add component button with selector: ${selector}`);
              addButton = button;
              break;
            }
          }
          
          if (addButton) {
            console.log('🔍 Step 7: Click add component button');
            await addButton.click();
            await page.waitForTimeout(3000); // Wait for component picker and plugin
            
            // Take screenshot of component picker
            await page.screenshot({ path: 'debug-listingtype-14-picker.png', fullPage: true });
            console.log('📸 Component picker screenshot saved');
            
            // Check if categories are visible or hidden
            console.log('🔍 Step 8: Check category visibility');
            const categoryNames = ['contact', 'violation', 'info', 'utilities', 'media', 'review', 'rating', 'content'];
            
            for (const categoryName of categoryNames) {
              const categoryElements = page.locator('*').filter({ hasText: new RegExp(`^${categoryName}$`, 'i') });
              const count = await categoryElements.count();
              
              if (count > 0) {
                console.log(`📋 Found category: ${categoryName} (${count} elements)`);
                
                for (let i = 0; i < count; i++) {
                  const element = categoryElements.nth(i);
                  const isVisible = await element.isVisible();
                  const displayStyle = await element.evaluate(el => window.getComputedStyle(el).display);
                  
                  console.log(`   Element ${i + 1}: visible=${isVisible}, display=${displayStyle}`);
                  
                  if (isVisible && displayStyle !== 'none') {
                    console.log(`❌ Category "${categoryName}" is STILL VISIBLE - Plugin not working!`);
                  } else {
                    console.log(`✅ Category "${categoryName}" is HIDDEN - Plugin working!`);
                  }
                }
              }
            }
            
            // Final API call check
            console.log(`📊 Final API calls count: ${apiCalls.length}`);
            if (apiCalls.length === 0) {
              console.log('❌ NO API CALLS MADE - Plugin not detecting ListingType change!');
            } else {
              console.log('✅ API calls were made - Plugin detected ListingType change');
            }
            
          } else {
            console.log('❌ Could not find add component button');
            
            // Debug: show all buttons
            const allButtons = await page.locator('button').all();
            console.log(`🔍 Found ${allButtons.length} buttons on page:`);
            for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
              const text = await allButtons[i].textContent();
              console.log(`   ${i + 1}. "${text}"`);
            }
          }
          
        } else {
          console.log('❌ Could not find "Test CSS Variables Theme" option');
          
          // Show available options
          const allOptions = await page.locator('[role="option"]').all();
          console.log(`🔍 Available options (${allOptions.length}):`);
          for (let i = 0; i < allOptions.length; i++) {
            const text = await allOptions[i].textContent();
            console.log(`   ${i + 1}. "${text}"`);
          }
        }
        
      } else {
        console.log('❌ Could not find ListingType input field');
      }
      
    } else {
      console.log('❌ Could not find ListingType label');
      
      // Debug: show all labels
      const allLabels = await page.locator('label').all();
      console.log(`🔍 Found ${allLabels.length} labels:`);
      for (let i = 0; i < Math.min(allLabels.length, 10); i++) {
        const text = await allLabels[i].textContent();
        console.log(`   ${i + 1}. "${text}"`);
      }
    }
    
    console.log('✅ Debug test completed');
  });
}); 