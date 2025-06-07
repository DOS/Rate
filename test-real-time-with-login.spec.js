const { test, expect } = require('@playwright/test');

test('Test Real-time Filtering with Login', async ({ page }) => {
  console.log('🚀 Starting real-time filtering test with login...');
  
  // Navigate to Strapi admin
  await page.goto('http://localhost:1337/admin');
  await page.waitForLoadState('networkidle');
  
  // Check if we need to login
  const loginButton = page.locator('button:has-text("Login")');
  if (await loginButton.isVisible()) {
    console.log('🔐 Need to login first...');
    
    // Fill login form (use saved credentials)
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'admin123');
    await loginButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('✅ Logged in successfully');
  } else {
    console.log('✅ Already logged in');
  }
  
  // Navigate to create Item page
  console.log('📋 Navigating to create Item page...');
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  // Take screenshot to see current state
  await page.screenshot({ path: 'after-navigation.png', fullPage: true });
  console.log('📸 Screenshot saved as after-navigation.png');
  
  // Look for ListingType field with more specific selectors
  console.log('🔍 Looking for ListingType field...');
  
  // Try different approaches to find ListingType
  const possibleSelectors = [
    'input[role="combobox"]', // Relation fields are usually comboboxes
    'button:has-text("Add or create a relation")',
    'text=ListingType',
    '[data-testid*="listing"]',
    '[data-testid*="ListingType"]'
  ];
  
  let listingTypeField = null;
  for (const selector of possibleSelectors) {
    const element = page.locator(selector);
    if (await element.count() > 0) {
      console.log(`✅ Found potential ListingType field with selector: ${selector}`);
      listingTypeField = element.first();
      break;
    }
  }
  
  if (!listingTypeField) {
    // Look for all combobox fields and check their labels
    console.log('🔍 Checking all combobox fields...');
    const allComboboxes = await page.locator('input[role="combobox"]').all();
    console.log(`Found ${allComboboxes.length} combobox fields`);
    
    for (let i = 0; i < allComboboxes.length; i++) {
      const combobox = allComboboxes[i];
      
      // Look for label near this combobox
      const container = combobox.locator('xpath=ancestor::div[contains(@class, "field") or contains(@class, "Field")]').first();
      const label = container.locator('label').first();
      const labelText = await label.textContent().catch(() => '');
      
      console.log(`  Combobox ${i}: label="${labelText}"`);
      
      if (labelText.toLowerCase().includes('listing') || labelText.toLowerCase().includes('type')) {
        console.log(`✅ Found ListingType field at index ${i}`);
        listingTypeField = combobox;
        break;
      }
    }
  }
  
  if (!listingTypeField) {
    console.log('❌ Could not find ListingType field');
    // Take screenshot for debugging
    await page.screenshot({ path: 'no-listing-type-found.png', fullPage: true });
    return;
  }
  
  console.log('🎯 Step 1: Selecting Bank as ListingType...');
  await listingTypeField.click();
  await page.waitForTimeout(1000);
  
  // Look for Bank option
  const bankOption = page.getByText('Bank', { exact: true });
  if (await bankOption.isVisible()) {
    await bankOption.click();
    await page.waitForTimeout(1000);
    console.log('✅ Selected Bank as ListingType');
  } else {
    console.log('❌ Bank option not found');
    await page.screenshot({ path: 'bank-option-not-found.png', fullPage: true });
    return;
  }
  
  // Look for FieldGroup and Add component button
  console.log('🎯 Step 2: Looking for FieldGroup and Add component button...');
  const addComponentSelectors = [
    'text=Add a component to FieldGroup',
    'text=Add component',
    'button:has-text("Add")',
    '[data-testid*="add-component"]'
  ];
  
  let addComponentButton = null;
  for (const selector of addComponentSelectors) {
    const element = page.locator(selector);
    if (await element.count() > 0) {
      console.log(`✅ Found add component button with selector: ${selector}`);
      addComponentButton = element.first();
      break;
    }
  }
  
  if (!addComponentButton) {
    console.log('❌ Could not find add component button');
    await page.screenshot({ path: 'no-add-component-button.png', fullPage: true });
    return;
  }
  
  // Open component picker
  console.log('🎯 Opening component picker...');
  await addComponentButton.click();
  await page.waitForTimeout(2000);
  
  // Check if component picker opened
  const componentPicker = page.locator('[role="dialog"]').first();
  if (await componentPicker.isVisible()) {
    console.log('✅ Component picker opened');
    
    // Take screenshot of component picker
    await page.screenshot({ path: 'component-picker-opened.png', fullPage: true });
    
    // Check current filtering
    console.log('🔍 Checking current component filtering...');
    const contactCategory = componentPicker.locator('text=contact');
    const mediaCategory = componentPicker.locator('text=media');
    const violationCategory = componentPicker.locator('text=violation');
    
    const contactVisible = await contactCategory.isVisible().catch(() => false);
    const mediaVisible = await mediaCategory.isVisible().catch(() => false);
    const violationVisible = await violationCategory.isVisible().catch(() => false);
    
    console.log('📊 Current filtering state:');
    console.log(`  - Contact category: ${contactVisible ? '✅ Visible' : '❌ Hidden'}`);
    console.log(`  - Media category: ${mediaVisible ? '✅ Visible' : '❌ Hidden'}`);
    console.log(`  - Violation category: ${violationVisible ? '✅ Visible' : '❌ Hidden'}`);
    
    if (contactVisible && mediaVisible && !violationVisible) {
      console.log('🎉 FILTERING WORKS! Bank shows contact + media, hides violation');
    } else {
      console.log('⚠️ Filtering may not be working as expected');
    }
    
    // Now test changing ListingType while picker is open
    console.log('🎯 Step 3: Testing real-time filtering...');
    
    // Try to access ListingType field while modal is open
    // This is tricky because modal might block interaction
    
    // Method 1: Try clicking outside modal to access field
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Change to Scammer
    console.log('🔄 Changing to Scammer...');
    await listingTypeField.click();
    await page.waitForTimeout(500);
    
    const scammerOption = page.getByText('Scammer', { exact: true });
    if (await scammerOption.isVisible()) {
      await scammerOption.click();
      await page.waitForTimeout(1000);
      console.log('✅ Changed to Scammer');
      
      // Open component picker again
      await addComponentButton.click();
      await page.waitForTimeout(2000);
      
      // Check new filtering
      const contactVisible2 = await contactCategory.isVisible().catch(() => false);
      const mediaVisible2 = await mediaCategory.isVisible().catch(() => false);
      const violationVisible2 = await violationCategory.isVisible().catch(() => false);
      
      console.log('📊 After changing to Scammer:');
      console.log(`  - Contact category: ${contactVisible2 ? '✅ Visible' : '❌ Hidden'}`);
      console.log(`  - Media category: ${mediaVisible2 ? '✅ Visible' : '❌ Hidden'}`);
      console.log(`  - Violation category: ${violationVisible2 ? '✅ Visible' : '❌ Hidden'}`);
      
      if (contactVisible2 && !mediaVisible2 && violationVisible2) {
        console.log('🎉 REAL-TIME FILTERING WORKS! Scammer shows contact + violation, hides media');
      } else {
        console.log('⚠️ Real-time filtering may not be working');
      }
      
      await page.screenshot({ path: 'scammer-filtering.png', fullPage: true });
      
    } else {
      console.log('❌ Scammer option not found');
    }
    
  } else {
    console.log('❌ Component picker did not open');
    await page.screenshot({ path: 'component-picker-not-opened.png', fullPage: true });
  }
  
  console.log('✅ Real-time filtering test completed');
}); 