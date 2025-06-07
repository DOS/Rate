const { test, expect } = require('@playwright/test');

test('Debug Smart Component Filter Plugin', async ({ page }) => {
  console.log('🚀 Starting debug test for Smart Component Filter Plugin...');
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.text().includes('Smart Component Filter') || 
        msg.text().includes('🎯') || 
        msg.text().includes('🔍') || 
        msg.text().includes('✅') || 
        msg.text().includes('❌') ||
        msg.text().includes('🚫')) {
      console.log(`[BROWSER] ${msg.text()}`);
    }
  });
  
  // Navigate to Strapi admin
  console.log('📍 Navigating to Strapi admin...');
  await page.goto('http://localhost:1337/admin');
  
  // Wait for login page or dashboard
  try {
    await page.waitForSelector('input[name="email"]', { timeout: 5000 });
    console.log('🔐 Login required, logging in...');
    
    await page.fill('input[name="email"]', 'admin@ratebox.vn');
    await page.fill('input[name="password"]', 'Ratebox2024');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin', { timeout: 10000 });
    console.log('✅ Login successful');
  } catch (e) {
    console.log('ℹ️ Already logged in or login not required');
  }
  
  // Navigate to Items collection
  console.log('📍 Navigating to Items collection...');
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item');
  await page.waitForLoadState('networkidle');
  
  // Click on an existing item to edit
  console.log('📝 Opening existing item for editing...');
  const itemRows = await page.locator('tr[data-testid]').count();
  console.log(`Found ${itemRows} item rows`);
  
  if (itemRows > 0) {
    await page.locator('tr[data-testid]').first().click();
    await page.waitForLoadState('networkidle');
    console.log('✅ Item opened for editing');
  } else {
    console.log('❌ No items found, creating new item...');
    await page.click('a[href*="create"]');
    await page.waitForLoadState('networkidle');
  }
  
  // Wait for the page to fully load
  await page.waitForTimeout(2000);
  
  // Look for ItemField dynamic zone
  console.log('🔍 Looking for ItemField dynamic zone...');
  const dynamicZones = await page.locator('[data-testid*="dynamic"], [class*="dynamic"], text="ItemField"').count();
  console.log(`Found ${dynamicZones} potential dynamic zones`);
  
  // Try to find "Add a component" button
  const addComponentSelectors = [
    'text="Add a component"',
    'text="Add component"', 
    'button:has-text("Add")',
    '[data-testid*="add"]',
    '[class*="add"]'
  ];
  
  let addButton = null;
  for (const selector of addComponentSelectors) {
    try {
      const button = page.locator(selector);
      if (await button.count() > 0) {
        addButton = button.first();
        console.log(`✅ Found add component button with selector: ${selector}`);
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  if (!addButton) {
    console.log('❌ Could not find add component button');
    
    // Debug: log all buttons on the page
    const allButtons = await page.locator('button').all();
    console.log(`🔍 Found ${allButtons.length} buttons on page:`);
    for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
      const text = await allButtons[i].textContent();
      console.log(`  Button ${i + 1}: "${text}"`);
    }
    return;
  }
  
  // Click the add component button
  console.log('🖱️ Clicking add component button...');
  await addButton.click();
  
  // Wait for component picker to appear
  await page.waitForTimeout(1000);
  
  // Debug: Check what appeared after clicking
  console.log('🔍 Analyzing DOM after clicking add component...');
  
  // Look for any modal, dialog, or popup
  const modalSelectors = [
    '[role="dialog"]',
    '[class*="modal"]',
    '[class*="popup"]',
    '[class*="picker"]',
    '[data-testid*="modal"]',
    '[data-testid*="dialog"]'
  ];
  
  let modalFound = false;
  for (const selector of modalSelectors) {
    const modal = page.locator(selector);
    if (await modal.count() > 0) {
      console.log(`✅ Found modal/dialog with selector: ${selector}`);
      modalFound = true;
      
      // Log content of the modal
      const modalText = await modal.textContent();
      console.log(`Modal content preview: ${modalText?.substring(0, 200)}...`);
      break;
    }
  }
  
  if (!modalFound) {
    console.log('❌ No modal/dialog found after clicking add component');
  }
  
  // Look for category headers with various selectors
  const categorySelectors = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    '[role="button"]',
    'button',
    '[data-testid*="category"]',
    '[class*="category"]'
  ];
  
  for (const selector of categorySelectors) {
    const elements = await page.locator(selector).all();
    if (elements.length > 0) {
      console.log(`🔍 Found ${elements.length} elements with selector: ${selector}`);
      
      // Check if any contain category-like text
      for (let i = 0; i < Math.min(elements.length, 5); i++) {
        const text = await elements[i].textContent();
        if (text && ['info', 'contact', 'violation', 'utilities', 'media', 'review', 'rating'].some(cat => 
          text.toLowerCase().includes(cat))) {
          console.log(`  ✅ Category-like element: "${text}"`);
        }
      }
    }
  }
  
  // Wait for plugin to process
  console.log('⏳ Waiting for plugin to process...');
  await page.waitForTimeout(3000);
  
  // Check if filtering occurred
  console.log('🔍 Checking if component filtering occurred...');
  
  // Look for hidden elements
  const hiddenElements = await page.locator('[style*="display: none"]').count();
  console.log(`Found ${hiddenElements} hidden elements`);
  
  // Take a screenshot for debugging
  await page.screenshot({ path: 'debug-component-picker.png', fullPage: true });
  console.log('📸 Screenshot saved as debug-component-picker.png');
  
  console.log('✅ Debug test completed');
}); 