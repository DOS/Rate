const { test, expect } = require('@playwright/test');

test('MCP Test Basic Component Picker Opening', async ({ page }) => {
  console.log('🚀 MCP Testing basic component picker opening...');
  
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
  
  // Wait a bit for page to fully load
  await page.waitForTimeout(2000);
  
  // Try to find and click the "Add a component" button
  console.log('🎯 Looking for Add component button...');
  
  // Try multiple selectors for the add component button
  const addButtonSelectors = [
    'button:has-text("Add a component")',
    'button:has-text("Add component")',
    'button:has-text("Choose component")',
    '[data-testid*="add-component"]',
    'button[aria-label*="component"]',
    'button[title*="component"]'
  ];
  
  let addButton = null;
  for (const selector of addButtonSelectors) {
    try {
      addButton = await page.locator(selector).first();
      if (await addButton.isVisible()) {
        console.log(`✅ Found add button with selector: ${selector}`);
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  if (!addButton || !(await addButton.isVisible())) {
    console.log('❌ Add component button not found, taking screenshot...');
    await page.screenshot({ path: 'mcp-no-add-button.png' });
    
    // Try to find any button with "component" in text
    const allButtons = await page.locator('button').all();
    console.log(`📊 Found ${allButtons.length} buttons on page`);
    
    for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
      const buttonText = await allButtons[i].textContent();
      if (buttonText && buttonText.toLowerCase().includes('component')) {
        console.log(`🔍 Button ${i}: "${buttonText}"`);
      }
    }
    return;
  }
  
  // Click the add component button
  console.log('🎯 Clicking add component button...');
  await addButton.click();
  
  // Wait for picker to appear
  await page.waitForTimeout(1500);
  
  // Check if picker dialog appeared
  const pickerDialog = await page.locator('[role="dialog"]');
  const isPickerVisible = await pickerDialog.isVisible();
  console.log(`📊 Component picker visible: ${isPickerVisible}`);
  
  if (isPickerVisible) {
    console.log('🎉 SUCCESS: Component picker opened successfully!');
    
    // Count available components
    const componentButtons = await page.locator('[role="dialog"] button').count();
    console.log(`📊 Total component buttons visible: ${componentButtons}`);
    
    // Take screenshot of successful picker
    await page.screenshot({ path: 'mcp-picker-success.png' });
    
    // Try to find category headers
    const categoryHeaders = await page.locator('[role="dialog"] h3, [role="dialog"] h2').all();
    console.log(`📊 Category headers found: ${categoryHeaders.length}`);
    
    for (let i = 0; i < categoryHeaders.length; i++) {
      const headerText = await categoryHeaders[i].textContent();
      console.log(`📂 Category ${i + 1}: "${headerText}"`);
    }
    
  } else {
    console.log('❌ Component picker did not open');
    await page.screenshot({ path: 'mcp-picker-failed.png' });
    
    // Check if any modal/dialog exists
    const anyDialog = await page.locator('[role="dialog"], .modal, [data-testid*="modal"]').count();
    console.log(`📊 Any dialogs found: ${anyDialog}`);
  }
  
  console.log('✅ Basic picker test completed');
}); 