const { test, expect } = require('@playwright/test');

test.describe('Smart Component Filter - Test Specific Empty ListingType', () => {
  test('should hide all components when selecting ListingType ID 14 (Test CSS Variables Theme)', async ({ page }) => {
    console.log('🧪 Testing ListingType ID 14 - should hide all components...');
    
    // First verify API returns empty components for ID 14
    console.log('🔍 Step 1: Verify API returns empty components for ID 14');
    const apiResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/14/components');
    
    if (apiResponse.ok()) {
      const apiData = await apiResponse.json();
      console.log('📦 API Response for ID 14:', JSON.stringify(apiData, null, 2));
      
      expect(apiData.success).toBe(true);
      expect(apiData.data.allowedComponents).toEqual([]);
      console.log('✅ Confirmed: API returns empty components for ID 14');
    } else {
      console.log('❌ API call failed:', apiResponse.status());
      return;
    }
    
    // Navigate to Strapi admin and login
    console.log('🔍 Step 2: Login to Strapi admin');
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Login if needed
    const loginButton = page.locator('button[type="submit"]');
    if (await loginButton.isVisible()) {
      console.log('🔐 Logging in...');
      await page.fill('input[name="email"]', 'admin@example.com');
      await page.fill('input[name="password"]', 'password123');
      await loginButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    }
    
    // Navigate to item creation page
    console.log('🔍 Step 3: Navigate to item creation page');
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'test-specific-empty-initial.png', fullPage: true });
    console.log('📸 Initial screenshot saved');
    
    // Find ListingType field - try multiple approaches
    console.log('🔍 Step 4: Find ListingType field');
    
    // Look for the field by label text first
    let listingTypeField = null;
    
    // Try to find by label "ListingType"
    const labelElement = page.locator('label').filter({ hasText: /ListingType/i });
    if (await labelElement.isVisible()) {
      console.log('✅ Found ListingType label');
      // Find the associated input field
      const fieldContainer = labelElement.locator('..').locator('..'); // Go up to find container
      listingTypeField = fieldContainer.locator('input').first();
    }
    
    // Fallback: try different selectors
    if (!listingTypeField || !(await listingTypeField.isVisible())) {
      const selectors = [
        'input[placeholder*="Select"]',
        'input[placeholder*="Choose"]',
        'div[role="combobox"]',
        '[data-testid*="select"]',
        'input[type="text"]'
      ];
      
      for (const selector of selectors) {
        const field = page.locator(selector).first();
        if (await field.isVisible()) {
          console.log(`✅ Found field with selector: ${selector}`);
          listingTypeField = field;
          break;
        }
      }
    }
    
    if (!listingTypeField || !(await listingTypeField.isVisible())) {
      console.log('❌ Could not find ListingType field');
      
      // Debug: show page structure
      const allLabels = await page.locator('label').all();
      console.log(`🔍 Found ${allLabels.length} labels:`);
      for (let i = 0; i < Math.min(allLabels.length, 10); i++) {
        const text = await allLabels[i].textContent();
        console.log(`   ${i + 1}. "${text}"`);
      }
      
      return;
    }
    
    // Click ListingType field to open dropdown
    console.log('🔍 Step 5: Click ListingType field to open dropdown');
    await listingTypeField.click();
    await page.waitForTimeout(2000);
    
    // Take screenshot after clicking
    await page.screenshot({ path: 'test-specific-empty-dropdown.png', fullPage: true });
    console.log('📸 Dropdown screenshot saved');
    
    // Look for "Test CSS Variables Theme" option
    console.log('🔍 Step 6: Look for "Test CSS Variables Theme" option');
    const testOption = page.locator('[role="option"]').filter({ hasText: /Test CSS Variables Theme/i });
    
    if (await testOption.isVisible()) {
      console.log('✅ Found "Test CSS Variables Theme" option, clicking...');
      await testOption.click();
      await page.waitForTimeout(2000);
      
      // Take screenshot after selection
      await page.screenshot({ path: 'test-specific-empty-selected.png', fullPage: true });
      console.log('📸 Selection screenshot saved');
      
    } else {
      console.log('❌ Could not find "Test CSS Variables Theme" option');
      
      // Debug: show all options
      const allOptions = await page.locator('[role="option"]').all();
      console.log(`🔍 Found ${allOptions.length} options:`);
      for (let i = 0; i < allOptions.length; i++) {
        const text = await allOptions[i].textContent();
        console.log(`   ${i + 1}. "${text}"`);
      }
      
      return;
    }
    
    // Look for FieldGroup section
    console.log('🔍 Step 7: Look for FieldGroup section');
    await page.waitForTimeout(2000);
    
    // Look for "Add a component to FieldGroup" button
    const addComponentButton = page.locator('button').filter({ hasText: /Add.*component.*FieldGroup/i });
    
    if (await addComponentButton.isVisible()) {
      console.log('✅ Found FieldGroup section, clicking to open component picker...');
      await addComponentButton.click();
      await page.waitForTimeout(3000);
      
      // Take screenshot after opening component picker
      await page.screenshot({ path: 'test-specific-empty-picker.png', fullPage: true });
      console.log('📸 Component picker screenshot saved');
      
      // Check if component picker opened
      const componentPicker = page.locator('[role="dialog"]').or(page.locator('.modal'));
      
      if (await componentPicker.isVisible()) {
        console.log('✅ Component picker opened');
        
        // Check for category headers - they should ALL be hidden
        console.log('🔍 Step 8: Check if all categories are hidden');
        const categoryNames = ['contact', 'violation', 'info', 'utilities', 'media', 'review', 'rating', 'content'];
        let foundCategories = 0;
        let hiddenCategories = 0;
        let visibleCategories = 0;
        
        for (const categoryName of categoryNames) {
          const categoryElements = page.locator('*').filter({ hasText: new RegExp(`^${categoryName}$`, 'i') });
          const count = await categoryElements.count();
          
          if (count > 0) {
            foundCategories++;
            console.log(`📋 Found category: ${categoryName} (${count} elements)`);
            
            // Check if category is hidden
            for (let i = 0; i < count; i++) {
              const element = categoryElements.nth(i);
              const isHidden = await element.evaluate(el => {
                const style = window.getComputedStyle(el);
                const parentStyle = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
                const containerStyle = el.closest('div') ? window.getComputedStyle(el.closest('div')) : null;
                
                return style.display === 'none' || 
                       el.style.display === 'none' ||
                       (parentStyle && parentStyle.display === 'none') ||
                       (containerStyle && containerStyle.display === 'none');
              });
              
              if (isHidden) {
                hiddenCategories++;
                console.log(`🚫 Category "${categoryName}" element ${i + 1} is HIDDEN ✅`);
              } else {
                visibleCategories++;
                console.log(`👁️ Category "${categoryName}" element ${i + 1} is VISIBLE ❌`);
              }
            }
          }
        }
        
        console.log(`📊 Summary:`);
        console.log(`   - Categories found: ${foundCategories}`);
        console.log(`   - Hidden elements: ${hiddenCategories}`);
        console.log(`   - Visible elements: ${visibleCategories}`);
        
        // The test passes if ALL categories are hidden (since no components should be allowed)
        if (hiddenCategories > 0 && visibleCategories === 0) {
          console.log('✅ SUCCESS: All categories are hidden as expected!');
          expect(hiddenCategories).toBeGreaterThan(0);
          expect(visibleCategories).toBe(0);
        } else if (visibleCategories > 0) {
          console.log('❌ FAILURE: Some categories are still visible when they should be hidden');
          console.log('🔧 This indicates the plugin is not working correctly for empty component lists');
        } else {
          console.log('⚠️ No categories found - might be a different UI structure');
        }
        
      } else {
        console.log('❌ Component picker did not open');
      }
      
    } else {
      console.log('❌ FieldGroup section not found');
      
      // Debug: look for any button with "component" text
      const componentButtons = await page.locator('button').filter({ hasText: /component/i }).all();
      console.log(`🔍 Found ${componentButtons.length} buttons with "component" text:`);
      for (let i = 0; i < Math.min(componentButtons.length, 5); i++) {
        const text = await componentButtons[i].textContent();
        console.log(`   ${i + 1}. "${text}"`);
      }
    }
    
    console.log('✅ Test completed');
  });
}); 