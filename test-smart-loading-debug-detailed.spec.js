const { test, expect } = require('@playwright/test');

test.describe('Smart Loading Debug - Detailed Analysis', () => {
  test('Debug Smart Loading with detailed console logs', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      
      // Filter for Smart Loading related logs
      if (text.includes('Smart') || text.includes('Component') || text.includes('Filter') || 
          text.includes('🔍') || text.includes('📡') || text.includes('🎯') || 
          text.includes('✅') || text.includes('❌') || text.includes('🚫')) {
        console.log(`[${type.toUpperCase()}] ${text}`);
      }
    });

    // Navigate to Strapi admin
    console.log('🚀 Navigating to Strapi admin...');
    await page.goto('http://localhost:1337/admin');
    
    // Wait for login page
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    
    // Login
    console.log('🔐 Logging in...');
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard - try multiple selectors
    try {
      await page.waitForSelector('[data-testid="homepage"]', { timeout: 5000 });
    } catch {
      try {
        await page.waitForSelector('text=Welcome', { timeout: 5000 });
      } catch {
        await page.waitForSelector('main', { timeout: 10000 });
      }
    }
    console.log('✅ Login successful');
    
    // Navigate to Content Manager
    await page.click('a[href="/admin/content-manager"]');
    await page.waitForSelector('text=Content Manager', { timeout: 10000 });
    
    // Navigate to Item collection
    await page.click('a[href*="api::item.item"]');
    await page.waitForSelector('text=Item', { timeout: 10000 });
    console.log('✅ Navigated to Item collection');
    
    // Create new item
    console.log('➕ Creating new item...');
    await page.click('a[href*="create"]');
    
    // Wait for create form - try multiple field selectors
    let formLoaded = false;
    const fieldSelectors = [
      'input[name="Name"]',
      'input[name="name"]', 
      'input[placeholder*="Name"]',
      'input[placeholder*="name"]',
      'textarea[name="Description"]',
      'textarea[name="description"]'
    ];
    
    for (const selector of fieldSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        console.log(`✅ Found form field: ${selector}`);
        formLoaded = true;
        break;
      } catch (e) {
        console.log(`❌ Field not found: ${selector}`);
      }
    }
    
    if (!formLoaded) {
      console.log('❌ Could not find form fields');
      return;
    }
    
    // Fill basic info - try different field names
    try {
      await page.fill('input[name="Name"]', 'Test Smart Loading Item');
    } catch {
      try {
        await page.fill('input[name="name"]', 'Test Smart Loading Item');
      } catch {
        console.log('⚠️ Could not fill Name field');
      }
    }
    
    try {
      await page.fill('textarea[name="Description"]', 'Testing Smart Loading functionality');
    } catch {
      try {
        await page.fill('textarea[name="description"]', 'Testing Smart Loading functionality');
      } catch {
        console.log('⚠️ Could not fill Description field');
      }
    }
    
    // Select ListingType - try Scammer first
    console.log('🎯 Selecting ListingType: Scammer...');
    
    // Find ListingType field - try multiple approaches
    let listingTypeSelected = false;
    
    // Approach 1: Look for relation field
    try {
      const relationButton = await page.waitForSelector('div:has-text("ListingType") button', { timeout: 5000 });
      await relationButton.click();
      await page.waitForSelector('text=Scammer', { timeout: 5000 });
      await page.click('text=Scammer');
      listingTypeSelected = true;
      console.log('✅ Selected Scammer via relation field');
    } catch (e) {
      console.log('❌ Relation field approach failed');
    }
    
    // Approach 2: Look for select dropdown
    if (!listingTypeSelected) {
      try {
        const selectButton = await page.waitForSelector('button:has-text("Select"), button:has-text("Choose")', { timeout: 5000 });
        await selectButton.click();
        await page.waitForSelector('text=Scammer', { timeout: 5000 });
        await page.click('text=Scammer');
        listingTypeSelected = true;
        console.log('✅ Selected Scammer via select dropdown');
      } catch (e) {
        console.log('❌ Select dropdown approach failed');
      }
    }
    
    if (!listingTypeSelected) {
      console.log('❌ Could not select ListingType');
      return;
    }
    
    // Wait a bit for the selection to register
    await page.waitForTimeout(2000);
    
    // Find and click FieldGroup Dynamic Zone
    console.log('🔍 Looking for FieldGroup Dynamic Zone...');
    
    // Try multiple selectors for Dynamic Zone
    const dynamicZoneSelectors = [
      'button:has-text("Add a component to FieldGroup")',
      'button:has-text("Add component")',
      'div:has-text("FieldGroup") button',
      '[data-testid*="dynamic-zone"] button',
      'button[aria-label*="Add"]'
    ];
    
    let dynamicZoneButton = null;
    for (const selector of dynamicZoneSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        dynamicZoneButton = selector;
        console.log(`✅ Found Dynamic Zone with selector: ${selector}`);
        break;
      } catch (e) {
        console.log(`❌ Selector not found: ${selector}`);
      }
    }
    
    if (!dynamicZoneButton) {
      console.log('❌ Could not find Dynamic Zone button');
      return;
    }
    
    // Click Dynamic Zone button
    console.log('🎯 Clicking Dynamic Zone button...');
    await page.click(dynamicZoneButton);
    
    // Wait for component picker to appear
    console.log('⏳ Waiting for component picker...');
    await page.waitForTimeout(3000);
    
    // Check if component picker appeared
    const componentPickerVisible = await page.isVisible('div[role="dialog"], .modal, [data-testid*="picker"]');
    console.log(`📋 Component picker visible: ${componentPickerVisible}`);
    
    if (componentPickerVisible) {
      // Wait a bit more for Smart Loading to process
      await page.waitForTimeout(2000);
      
      // Count visible categories and components
      const allCategories = await page.$$('h3[role="button"], h2[role="button"], h4[role="button"]');
      const visibleCategories = [];
      
      for (const category of allCategories) {
        const isVisible = await category.isVisible();
        const text = await category.textContent();
        if (isVisible && text) {
          visibleCategories.push(text.trim());
        }
      }
      
      console.log(`📊 Visible categories (${visibleCategories.length}):`, visibleCategories);
      
      // Count all buttons/components
      const allButtons = await page.$$('button:not([role="button"])');
      const visibleComponents = [];
      
      for (const button of allButtons) {
        const isVisible = await button.isVisible();
        const text = await button.textContent();
        if (isVisible && text && text.trim() && !visibleCategories.includes(text.trim())) {
          visibleComponents.push(text.trim());
        }
      }
      
      console.log(`📊 Visible components (${visibleComponents.length}):`, visibleComponents);
      
      // Expected for Scammer: contact.* and violation.* categories
      const expectedCategories = ['contact', 'violation'];
      const foundExpectedCategories = expectedCategories.filter(cat => 
        visibleCategories.some(visible => visible.toLowerCase().includes(cat))
      );
      
      console.log(`🎯 Expected categories for Scammer: ${expectedCategories.join(', ')}`);
      console.log(`✅ Found expected categories: ${foundExpectedCategories.join(', ')}`);
      
      if (foundExpectedCategories.length === expectedCategories.length) {
        console.log('🎉 Smart Loading appears to be working correctly!');
      } else {
        console.log('⚠️ Smart Loading may not be filtering correctly');
        console.log('📋 All visible categories:', visibleCategories);
      }
      
    } else {
      console.log('❌ Component picker did not appear');
    }
    
    // Wait to see final state
    await page.waitForTimeout(5000);
    
    console.log('✅ Test completed');
  });
}); 