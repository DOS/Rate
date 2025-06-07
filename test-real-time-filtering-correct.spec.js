const { test, expect } = require('@playwright/test');

test('Test Real-time Component Filtering with Correct Credentials', async ({ page }) => {
  console.log('🚀 Starting real-time filtering test with correct credentials...');
  
  // Navigate to Strapi admin
  await page.goto('http://localhost:1337/admin');
  await page.waitForLoadState('networkidle');
  
  // Check if we need to login
  const loginButton = page.locator('button:has-text("Login")');
  if (await loginButton.isVisible()) {
    console.log('🔐 Need to login first...');
    
    // Fill login form with correct credentials
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await loginButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    console.log('✅ Logged in successfully');
  } else {
    console.log('✅ Already logged in');
  }
  
  // Navigate to create Item page
  console.log('📋 Navigating to create Item page...');
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000); // Wait for page to fully load
  
  // Take screenshot for debugging
  await page.screenshot({ path: 'test-item-create-page.png', fullPage: true });
  console.log('📸 Screenshot saved as test-item-create-page.png');
  
  // Look for ListingType field
  console.log('🔍 Looking for ListingType field...');
  
  // Try different selectors for ListingType field
  const listingTypeSelectors = [
    '[data-strapi-field-name="ListingType"]',
    'input[name="ListingType"]',
    'select[name="ListingType"]',
    '[placeholder*="ListingType"]',
    'label:has-text("ListingType")',
    'div:has-text("ListingType")',
    '[role="combobox"]'
  ];
  
  let listingTypeField = null;
  for (const selector of listingTypeSelectors) {
    const field = page.locator(selector).first();
    if (await field.isVisible()) {
      console.log(`✅ Found ListingType field with selector: ${selector}`);
      listingTypeField = field;
      break;
    }
  }
  
  if (!listingTypeField) {
    console.log('❌ ListingType field not found, listing all form fields...');
    const allInputs = await page.locator('input, select, [role="combobox"]').all();
    for (let i = 0; i < allInputs.length; i++) {
      const input = allInputs[i];
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');
      const role = await input.getAttribute('role');
      console.log(`Field ${i}: name="${name}", placeholder="${placeholder}", role="${role}"`);
    }
    return;
  }
  
  // Step 1: Select Bank first
  console.log('🎯 Step 1: Selecting Bank as ListingType...');
  await listingTypeField.click();
  await page.waitForTimeout(1000);
  
  // Look for Bank option
  const bankOption = page.locator('text="Bank"').first();
  if (await bankOption.isVisible()) {
    await bankOption.click();
    console.log('✅ Selected Bank');
    await page.waitForTimeout(2000);
  } else {
    console.log('❌ Bank option not found');
    return;
  }
  
  // Step 2: Open component picker
  console.log('🎯 Step 2: Opening component picker...');
  const addComponentButton = page.locator('button:has-text("Add a component")').first();
  if (await addComponentButton.isVisible()) {
    await addComponentButton.click();
    await page.waitForTimeout(2000);
    console.log('✅ Component picker opened');
    
    // Take screenshot of component picker with Bank selected
    await page.screenshot({ path: 'test-component-picker-bank.png', fullPage: true });
    console.log('📸 Component picker screenshot saved');
    
    // Count visible components for Bank
    const visibleComponents = await page.locator('[role="dialog"] button:not([style*="display: none"])').count();
    console.log(`📊 Visible components for Bank: ${visibleComponents}`);
    
  } else {
    console.log('❌ Add component button not found');
    return;
  }
  
  // Step 3: Change ListingType to Scammer while component picker is open
  console.log('🎯 Step 3: Changing ListingType to Scammer while picker is open...');
  
  // Look for ListingType field again (might be different when picker is open)
  const listingTypeInForm = page.locator('[data-strapi-field-name="ListingType"] [role="combobox"]').first();
  if (await listingTypeInForm.isVisible()) {
    await listingTypeInForm.click();
    await page.waitForTimeout(1000);
    
    // Look for Scammer option
    const scammerOption = page.locator('text="Scammer"').first();
    if (await scammerOption.isVisible()) {
      await scammerOption.click();
      console.log('✅ Selected Scammer while picker is open');
      await page.waitForTimeout(3000); // Wait for real-time filtering
      
      // Take screenshot after changing to Scammer
      await page.screenshot({ path: 'test-component-picker-scammer.png', fullPage: true });
      console.log('📸 Component picker after Scammer selection screenshot saved');
      
      // Count visible components for Scammer
      const visibleComponentsAfter = await page.locator('[role="dialog"] button:not([style*="display: none"])').count();
      console.log(`📊 Visible components for Scammer: ${visibleComponentsAfter}`);
      
      // Check if filtering worked
      if (visibleComponentsAfter !== visibleComponents) {
        console.log('🎉 SUCCESS: Real-time filtering worked! Component count changed.');
      } else {
        console.log('❌ FAILED: Real-time filtering did not work. Component count unchanged.');
      }
      
    } else {
      console.log('❌ Scammer option not found');
    }
  } else {
    console.log('❌ ListingType field not found in form');
  }
  
  // Wait a bit more to see final state
  await page.waitForTimeout(2000);
  
  // Take final screenshot
  await page.screenshot({ path: 'test-final-state.png', fullPage: true });
  console.log('📸 Final state screenshot saved');
  
  console.log('✅ Test completed');
}); 