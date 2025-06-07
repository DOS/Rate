const { test, expect } = require('@playwright/test');

test('Final Real-time Filtering Test with Correct Selectors', async ({ page }) => {
  console.log('🚀 Starting final real-time filtering test...');
  
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
  
  console.log('🔍 Looking for ListingType field...');
  
  // Use the correct selector for ListingType relation field
  const listingTypeInput = page.locator('input[name="ListingType"]');
  if (await listingTypeInput.isVisible()) {
    console.log('✅ Found ListingType input field');
    
    // Step 1: Click on ListingType field to open dropdown
    console.log('🎯 Step 1: Opening ListingType dropdown...');
    await listingTypeInput.click();
    await page.waitForTimeout(2000);
    
    // Look for Bank option in dropdown
    const bankOption = page.locator('text="Bank"').first();
    if (await bankOption.isVisible()) {
      await bankOption.click();
      console.log('✅ Selected Bank');
      await page.waitForTimeout(3000); // Wait for selection to register
      
      // Take screenshot after Bank selection
      await page.screenshot({ path: 'final-bank-selected.png', fullPage: true });
      
      // Step 2: Open component picker
      console.log('🎯 Step 2: Opening component picker...');
      const addComponentButton = page.locator('button:has-text("Add a component")').first();
      if (await addComponentButton.isVisible()) {
        await addComponentButton.click();
        await page.waitForTimeout(2000);
        console.log('✅ Component picker opened');
        
        // Check component picker dialog
        const dialog = page.locator('[role="dialog"]').first();
        if (await dialog.isVisible()) {
          console.log('✅ Component picker dialog is visible');
          
          // Count components for Bank
          const bankComponents = await dialog.locator('button:visible').count();
          console.log(`📊 Components visible for Bank: ${bankComponents}`);
          
          // List component names for Bank
          const bankComponentTexts = await dialog.locator('button:visible').allTextContents();
          console.log('📋 Bank components:', bankComponentTexts);
          
          // Take screenshot of Bank components
          await page.screenshot({ path: 'final-bank-components.png', fullPage: true });
          
          // Step 3: Change to Scammer while picker is open
          console.log('🎯 Step 3: Changing to Scammer while picker is open...');
          
          // Click on ListingType field again (it should still be accessible)
          await listingTypeInput.click();
          await page.waitForTimeout(1000);
          
          // Look for Scammer option
          const scammerOption = page.locator('text="Scammer"').first();
          if (await scammerOption.isVisible()) {
            await scammerOption.click();
            console.log('✅ Selected Scammer while picker is open');
            await page.waitForTimeout(5000); // Wait longer for real-time filtering
            
            // Check if dialog is still open
            if (await dialog.isVisible()) {
              console.log('✅ Dialog still open after ListingType change');
              
              // Count components for Scammer
              const scammerComponents = await dialog.locator('button:visible').count();
              console.log(`📊 Components visible for Scammer: ${scammerComponents}`);
              
              // List component names for Scammer
              const scammerComponentTexts = await dialog.locator('button:visible').allTextContents();
              console.log('📋 Scammer components:', scammerComponentTexts);
              
              // Take screenshot of Scammer components
              await page.screenshot({ path: 'final-scammer-components.png', fullPage: true });
              
              // Check if real-time filtering worked
              if (scammerComponents !== bankComponents) {
                console.log('🎉 SUCCESS: Real-time filtering worked!');
                console.log(`📊 Bank: ${bankComponents} components → Scammer: ${scammerComponents} components`);
                console.log('📋 Component change detected - filtering is working!');
              } else {
                console.log('❌ FAILED: Real-time filtering did not work');
                console.log(`📊 Component count unchanged: ${bankComponents} → ${scammerComponents}`);
                
                // Check if component names changed even if count is same
                const bankSet = new Set(bankComponentTexts);
                const scammerSet = new Set(scammerComponentTexts);
                const hasChanges = bankComponentTexts.length !== scammerComponentTexts.length || 
                                 !bankComponentTexts.every(text => scammerSet.has(text));
                
                if (hasChanges) {
                  console.log('🎉 SUCCESS: Component names changed - filtering is working!');
                  console.log('📋 Different components shown for different ListingTypes');
                } else {
                  console.log('❌ FAILED: No changes detected in components');
                }
              }
              
            } else {
              console.log('❌ Dialog closed after ListingType change');
            }
          } else {
            console.log('❌ Scammer option not found');
            
            // Debug: list all visible options
            const allOptions = await page.locator('text=/^(Bank|Scammer|Business)$/').allTextContents();
            console.log('📋 Available options:', allOptions);
          }
        } else {
          console.log('❌ Component picker dialog not found');
        }
      } else {
        console.log('❌ Add component button not found');
      }
    } else {
      console.log('❌ Bank option not found');
      
      // Debug: take screenshot of dropdown
      await page.screenshot({ path: 'final-dropdown-debug.png', fullPage: true });
      
      // List all visible text options
      const allTexts = await page.locator('text=/^(Bank|Scammer|Business)$/').allTextContents();
      console.log('📋 Available options:', allTexts);
    }
  } else {
    console.log('❌ ListingType input field not found');
  }
  
  console.log('✅ Final test completed');
}); 