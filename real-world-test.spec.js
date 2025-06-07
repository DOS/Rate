const { test, expect } = require('@playwright/test');

test('Real World Plugin Test', async ({ page }) => {
  console.log('🚀 Starting real world plugin test...');
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.text().includes('Smart Component Filter') || 
        msg.text().includes('🎯') || 
        msg.text().includes('🔍') || 
        msg.text().includes('✅') || 
        msg.text().includes('❌') ||
        msg.text().includes('🚫') ||
        msg.text().includes('🔧')) {
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
  
  // Click "Create new entry" button
  console.log('📝 Creating new item...');
  await page.click('a[href*="create"]');
  await page.waitForLoadState('networkidle');
  
  // Fill required fields first
  console.log('📝 Filling required fields...');
  
  // Fill Title
  await page.fill('input[name="Title"]', 'Test Item for Plugin');
  
  // Fill Description
  await page.fill('textarea[name="Description"]', 'This is a test item to verify the Smart Component Filter plugin works correctly.');
  
  // Select Listing Type (Scammer - ID 18)
  console.log('🔍 Selecting Listing Type...');
  
  // Look for ListingType field and click it
  const listingTypeSelectors = [
    'text="ListingType"',
    '[name*="ListingType"]',
    'label:has-text("ListingType")',
    'input[placeholder*="ListingType"]'
  ];
  
  let listingTypeField = null;
  for (const selector of listingTypeSelectors) {
    try {
      const field = page.locator(selector);
      if (await field.count() > 0) {
        listingTypeField = field;
        console.log(`✅ Found ListingType field with selector: ${selector}`);
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  if (listingTypeField) {
    // Click to open dropdown
    await listingTypeField.click();
    await page.waitForTimeout(1000);
    
    // Select "Scammer" option
    const scammerOption = page.locator('text="Scammer"');
    if (await scammerOption.count() > 0) {
      await scammerOption.click();
      console.log('✅ Selected Scammer listing type');
    } else {
      console.log('❌ Could not find Scammer option');
    }
  } else {
    console.log('❌ Could not find ListingType field');
  }
  
  // Scroll down to find ItemField dynamic zone
  console.log('🔍 Looking for ItemField dynamic zone...');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  
  await page.waitForTimeout(2000);
  
  // Look for ItemField section
  const itemFieldSelectors = [
    'text="ItemField"',
    'label:has-text("ItemField")',
    '[data-testid*="ItemField"]',
    '[class*="ItemField"]'
  ];
  
  let itemFieldSection = null;
  for (const selector of itemFieldSelectors) {
    try {
      const section = page.locator(selector);
      if (await section.count() > 0) {
        itemFieldSection = section;
        console.log(`✅ Found ItemField section with selector: ${selector}`);
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  if (!itemFieldSection) {
    console.log('❌ Could not find ItemField section');
    await page.screenshot({ path: 'debug-no-itemfield.png', fullPage: true });
    return;
  }
  
  // Look for "Add a component" button near ItemField
  console.log('🔍 Looking for Add component button...');
  
  const addComponentSelectors = [
    'text="Add a component to FieldGroup"',
    'text="Add a component"',
    'button:has-text("Add a component")',
    'button:has-text("Add")',
    '[data-testid*="add-component"]'
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
    await page.screenshot({ path: 'debug-no-add-button-new.png', fullPage: true });
    
    // Debug: log all buttons
    const allButtons = await page.locator('button').all();
    console.log(`🔍 Found ${allButtons.length} buttons on page:`);
    for (let i = 0; i < Math.min(allButtons.length, 30); i++) {
      const text = await allButtons[i].textContent();
      if (text && (text.toLowerCase().includes('add') || text.toLowerCase().includes('component'))) {
        console.log(`  Button ${i + 1}: "${text}"`);
      }
    }
    return;
  }
  
  // Click the add component button
  console.log('🖱️ Clicking add component button...');
  await addButton.click();
  
  // Wait for component picker to appear
  await page.waitForTimeout(2000);
  
  // Take screenshot after clicking
  await page.screenshot({ path: 'debug-component-picker-opened.png', fullPage: true });
  console.log('📸 Screenshot saved as debug-component-picker-opened.png');
  
  // Wait for plugin to process
  console.log('⏳ Waiting for plugin to process...');
  await page.waitForTimeout(3000);
  
  // Check what categories are visible
  console.log('🔍 Checking visible categories...');
  
  const categoryElements = await page.locator('h1, h2, h3, h4, h5, h6, button, div').all();
  const visibleCategories = [];
  
  for (const element of categoryElements) {
    const text = await element.textContent();
    if (text && ['info', 'contact', 'violation', 'utilities', 'media', 'review', 'rating'].some(cat => 
      text.toLowerCase().includes(cat))) {
      const isVisible = await element.isVisible();
      visibleCategories.push({ text: text.trim(), visible: isVisible });
    }
  }
  
  console.log('📋 Found categories:', visibleCategories);
  
  // Check if only "info" category is visible (since we only allow info.bank-info)
  const infoCategoryVisible = visibleCategories.some(cat => 
    cat.text.toLowerCase().includes('info') && cat.visible);
  const otherCategoriesHidden = visibleCategories.filter(cat => 
    !cat.text.toLowerCase().includes('info')).every(cat => !cat.visible);
  
  if (infoCategoryVisible && otherCategoriesHidden) {
    console.log('✅ Plugin working correctly: Only info category is visible');
  } else {
    console.log('❌ Plugin not working: Multiple categories still visible');
  }
  
  // Look for hidden elements
  const hiddenElements = await page.locator('[style*="display: none"]').count();
  console.log(`Found ${hiddenElements} hidden elements`);
  
  // Take final screenshot
  await page.screenshot({ path: 'debug-final-result.png', fullPage: true });
  console.log('📸 Final screenshot saved as debug-final-result.png');
  
  console.log('✅ Real world test completed');
}); 