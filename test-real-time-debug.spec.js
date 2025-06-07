const { test, expect } = require('@playwright/test');

test('Debug Real-time Filtering with Better Selectors', async ({ page }) => {
  console.log('🚀 Starting debug real-time filtering test...');
  
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
  
  console.log('🔍 Analyzing page structure...');
  
  // Find ListingType field more precisely
  const listingTypeField = page.locator('[data-strapi-field-name="ListingType"] [role="combobox"]').first();
  if (await listingTypeField.isVisible()) {
    console.log('✅ Found ListingType field');
    
    // Step 1: Select Bank
    console.log('🎯 Selecting Bank...');
    await listingTypeField.click();
    await page.waitForTimeout(1000);
    
    const bankOption = page.locator('text="Bank"').first();
    await bankOption.click();
    console.log('✅ Selected Bank');
    await page.waitForTimeout(2000);
    
    // Step 2: Open component picker
    console.log('🎯 Opening component picker...');
    const addComponentButton = page.locator('button:has-text("Add a component")').first();
    await addComponentButton.click();
    await page.waitForTimeout(2000);
    
    // Debug component picker structure
    console.log('🔍 Analyzing component picker structure...');
    
    // Check if dialog is open
    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.isVisible()) {
      console.log('✅ Component picker dialog is open');
      
      // Count all buttons in dialog
      const allButtons = await dialog.locator('button').count();
      console.log(`📊 Total buttons in dialog: ${allButtons}`);
      
      // Count visible buttons (not hidden)
      const visibleButtons = await dialog.locator('button:visible').count();
      console.log(`📊 Visible buttons in dialog: ${visibleButtons}`);
      
      // List all button texts
      const buttonTexts = await dialog.locator('button').allTextContents();
      console.log('📋 Button texts:', buttonTexts);
      
      // Look for component categories
      const categories = await dialog.locator('h3, h4, [role="heading"]').allTextContents();
      console.log('📋 Categories found:', categories);
      
      // Take screenshot
      await page.screenshot({ path: 'debug-component-picker-structure.png', fullPage: true });
      
      // Step 3: Try to change ListingType while picker is open
      console.log('🎯 Attempting to change ListingType while picker is open...');
      
      // Try clicking outside dialog first to access form
      await page.click('body', { position: { x: 100, y: 100 } });
      await page.waitForTimeout(500);
      
      // Try to find ListingType field again
      const listingTypeFieldAgain = page.locator('[data-strapi-field-name="ListingType"] [role="combobox"]').first();
      if (await listingTypeFieldAgain.isVisible()) {
        console.log('✅ Found ListingType field while picker is open');
        await listingTypeFieldAgain.click();
        await page.waitForTimeout(1000);
        
        const scammerOption = page.locator('text="Scammer"').first();
        if (await scammerOption.isVisible()) {
          await scammerOption.click();
          console.log('✅ Selected Scammer');
          await page.waitForTimeout(3000); // Wait for real-time filtering
          
          // Check if dialog is still open
          if (await dialog.isVisible()) {
            console.log('✅ Dialog still open after ListingType change');
            
            // Count buttons again
            const newVisibleButtons = await dialog.locator('button:visible').count();
            console.log(`📊 Visible buttons after Scammer selection: ${newVisibleButtons}`);
            
            // Check if filtering worked
            if (newVisibleButtons !== visibleButtons) {
              console.log('🎉 SUCCESS: Real-time filtering worked!');
              console.log(`📊 Bank components: ${visibleButtons}, Scammer components: ${newVisibleButtons}`);
            } else {
              console.log('❌ Real-time filtering did not work - button count unchanged');
            }
            
            // Take final screenshot
            await page.screenshot({ path: 'debug-after-scammer-selection.png', fullPage: true });
            
          } else {
            console.log('❌ Dialog closed after ListingType change');
          }
        } else {
          console.log('❌ Scammer option not found');
        }
      } else {
        console.log('❌ ListingType field not accessible while picker is open');
        
        // Try alternative approach - look for ListingType in different areas
        const allComboboxes = await page.locator('[role="combobox"]').count();
        console.log(`📊 Total comboboxes on page: ${allComboboxes}`);
        
        for (let i = 0; i < allComboboxes; i++) {
          const combobox = page.locator('[role="combobox"]').nth(i);
          const value = await combobox.textContent();
          console.log(`Combobox ${i}: "${value}"`);
        }
      }
    } else {
      console.log('❌ Component picker dialog not found');
    }
  } else {
    console.log('❌ ListingType field not found');
  }
  
  console.log('✅ Debug test completed');
}); 