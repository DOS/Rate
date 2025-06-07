const { test, expect } = require('@playwright/test');

test('Debug Component Picker Structure', async ({ page }) => {
  console.log('🚀 Starting component picker structure debug...');
  
  // Navigate to Strapi admin and login
  await page.goto('http://localhost:1337/admin');
  await page.waitForLoadState('networkidle');
  
  const loginButton = page.locator('button:has-text("Login")');
  if (await loginButton.isVisible()) {
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await loginButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    console.log('✅ Logged in successfully');
  }
  
  // Navigate to create Item page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  
  // Select Bank first
  const listingTypeInput = page.locator('input[name="ListingType"]');
  await listingTypeInput.click();
  await page.waitForTimeout(1000);
  const bankOption = page.locator('text="Bank"').first();
  await bankOption.click();
  console.log('✅ Selected Bank');
  await page.waitForTimeout(3000);
  
  // Take screenshot before opening picker
  await page.screenshot({ path: 'debug-before-picker.png', fullPage: true });
  
  // Open component picker
  console.log('🎯 Opening component picker...');
  const addComponentButton = page.locator('button:has-text("Add a component")').first();
  await addComponentButton.click();
  await page.waitForTimeout(3000);
  
  // Take screenshot after opening picker
  await page.screenshot({ path: 'debug-after-picker.png', fullPage: true });
  
  console.log('🔍 Analyzing component picker structure...');
  
  // Try different selectors for component picker
  const possibleSelectors = [
    '[role="dialog"]',
    '.modal',
    '[data-testid="component-picker"]',
    '[aria-modal="true"]',
    '.component-picker',
    '.picker-modal',
    'div[style*="position: fixed"]',
    'div[style*="z-index"]'
  ];
  
  let pickerElement = null;
  for (const selector of possibleSelectors) {
    const element = page.locator(selector).first();
    if (await element.isVisible()) {
      console.log(`✅ Found picker with selector: ${selector}`);
      pickerElement = element;
      break;
    }
  }
  
  if (!pickerElement) {
    console.log('❌ No picker found with standard selectors, trying broader search...');
    
    // Look for any element that appeared after clicking the button
    const allDivs = await page.locator('div').count();
    console.log(`📊 Total divs on page: ${allDivs}`);
    
    // Look for elements with specific text that might indicate component picker
    const componentTexts = ['Basic', 'Location', 'Social', 'Media Gallery', 'Description'];
    for (const text of componentTexts) {
      const element = page.locator(`text="${text}"`);
      if (await element.isVisible()) {
        console.log(`✅ Found component text: "${text}"`);
        
        // Get the parent container
        const parent = element.locator('..').first();
        const grandParent = parent.locator('..').first();
        
        console.log(`📍 Component "${text}" found in container`);
        
        // This might be our picker container
        pickerElement = grandParent;
        break;
      }
    }
  }
  
  if (pickerElement) {
    console.log('✅ Found component picker container');
    
    // Count all buttons in picker
    const allButtons = await pickerElement.locator('button').count();
    console.log(`📊 Total buttons in picker: ${allButtons}`);
    
    // Count visible buttons
    const visibleButtons = await pickerElement.locator('button:visible').count();
    console.log(`📊 Visible buttons in picker: ${visibleButtons}`);
    
    // List all button texts
    const buttonTexts = await pickerElement.locator('button').allTextContents();
    console.log('📋 All button texts:', buttonTexts);
    
    // List visible button texts
    const visibleButtonTexts = await pickerElement.locator('button:visible').allTextContents();
    console.log('📋 Visible button texts:', visibleButtonTexts);
    
    // Look for categories/headings
    const headings = await pickerElement.locator('h1, h2, h3, h4, h5, h6, [role="heading"]').allTextContents();
    console.log('📋 Headings in picker:', headings);
    
    // Now test real-time filtering
    console.log('🎯 Testing real-time filtering...');
    
    // Change to Scammer
    await listingTypeInput.click();
    await page.waitForTimeout(1000);
    const scammerOption = page.locator('text="Scammer"').first();
    if (await scammerOption.isVisible()) {
      await scammerOption.click();
      console.log('✅ Selected Scammer');
      await page.waitForTimeout(5000); // Wait for filtering
      
      // Take screenshot after Scammer selection
      await page.screenshot({ path: 'debug-after-scammer.png', fullPage: true });
      
      // Count buttons again
      const newVisibleButtons = await pickerElement.locator('button:visible').count();
      console.log(`📊 Visible buttons after Scammer: ${newVisibleButtons}`);
      
      // List new button texts
      const newVisibleButtonTexts = await pickerElement.locator('button:visible').allTextContents();
      console.log('📋 New visible button texts:', newVisibleButtonTexts);
      
      // Compare results
      if (newVisibleButtons !== visibleButtons) {
        console.log('🎉 SUCCESS: Button count changed!');
        console.log(`📊 Bank: ${visibleButtons} → Scammer: ${newVisibleButtons}`);
      } else {
        console.log('📊 Button count unchanged, checking content...');
        
        const hasContentChanges = visibleButtonTexts.length !== newVisibleButtonTexts.length ||
                                 !visibleButtonTexts.every(text => newVisibleButtonTexts.includes(text));
        
        if (hasContentChanges) {
          console.log('🎉 SUCCESS: Button content changed!');
          console.log('📋 Different components shown for different ListingTypes');
        } else {
          console.log('❌ No changes detected');
        }
      }
    } else {
      console.log('❌ Scammer option not found');
    }
    
  } else {
    console.log('❌ Could not find component picker container');
    
    // Debug: list all visible elements with "component" in class or text
    const componentElements = await page.locator('[class*="component"], [data-testid*="component"], text=/component/i').count();
    console.log(`📊 Elements with "component": ${componentElements}`);
  }
  
  console.log('✅ Debug completed');
}); 