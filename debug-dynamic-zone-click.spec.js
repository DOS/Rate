const { test } = require('@playwright/test');

test('debug dynamic zone click', async ({ page }) => {
  console.log('🔍 Debug Dynamic Zone click...');
  
  // Login
  await page.goto('http://localhost:1337/admin/auth/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForURL('**/admin', { timeout: 30000 });
  } catch (e) {
    if (page.url().includes('/admin')) console.log('✅ At admin page');
  }
  console.log('✅ Login successful');
  
  // Go to item create page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  
  // Find and select Bank in ListingType
  const listingTypeLabel = page.locator('label:has-text("ListingType")').first();
  if (await listingTypeLabel.isVisible()) {
    console.log('✅ Found ListingType label');
    
    const parentContainer = listingTypeLabel.locator('xpath=..').first();
    const combobox = parentContainer.locator('[role="combobox"]').first();
    
    if (await combobox.isVisible()) {
      console.log('✅ Found ListingType combobox');
      await combobox.click();
      await page.waitForTimeout(2000);
      
      const bankOption = page.locator('text=Bank').first();
      if (await bankOption.isVisible()) {
        console.log('✅ Selecting Bank...');
        await bankOption.click();
        await page.waitForTimeout(3000);
        console.log('✅ Bank selected');
        
        // Now debug Dynamic Zone button
        console.log('🔍 Looking for Dynamic Zone button...');
        
        // Try different selectors for Dynamic Zone button
        const dzSelectors = [
          'button:has-text("Add a component to FieldGroup")',
          'button:has-text("Add component")',
          'button:has-text("Add a component")',
          'button:has-text("Choose component")',
          'button[aria-label*="component"]',
          'button[title*="component"]'
        ];
        
        let dzButton = null;
        for (const selector of dzSelectors) {
          const button = page.locator(selector).first();
          if (await button.isVisible()) {
            dzButton = button;
            console.log(`✅ Found Dynamic Zone button with selector: ${selector}`);
            break;
          }
        }
        
        if (dzButton) {
          console.log('🔍 Clicking Dynamic Zone button...');
          await dzButton.click();
          await page.waitForTimeout(3000);
          
          // Check for any dialogs/modals that might have opened
          console.log('🔍 Checking for opened dialogs...');
          
          const dialogSelectors = [
            '[role="dialog"]',
            '.modal',
            '[data-testid*="modal"]',
            '[data-testid*="picker"]',
            '[data-testid*="component"]',
            '.component-picker',
            '.picker',
            '[aria-modal="true"]'
          ];
          
          let foundDialog = false;
          for (const selector of dialogSelectors) {
            const dialog = page.locator(selector).first();
            if (await dialog.isVisible()) {
              console.log(`✅ Found dialog with selector: ${selector}`);
              foundDialog = true;
              
              // Count elements in dialog
              const buttons = await dialog.locator('button').count();
              const text = await dialog.textContent();
              console.log(`📊 Dialog has ${buttons} buttons`);
              console.log(`📝 Dialog text preview: "${text?.substring(0, 200)}"`);
              
              break;
            }
          }
          
          if (!foundDialog) {
            console.log('❌ No dialog found after clicking Dynamic Zone button');
            
            // Check if page changed or any new elements appeared
            console.log('🔍 Checking for any new elements...');
            
            // Look for any elements that might contain component options
            const componentElements = await page.locator('*:has-text("contact"), *:has-text("violation"), *:has-text("component")').count();
            console.log(`📊 Found ${componentElements} elements with component-related text`);
            
            // Take screenshot for debugging
            await page.screenshot({ path: 'debug-dynamic-zone-click.png' });
            console.log('📸 Screenshot saved for debugging');
          }
          
        } else {
          console.log('❌ Dynamic Zone button not found');
          
          // Debug: show all buttons on page
          const allButtons = await page.locator('button').all();
          console.log(`📊 All buttons on page (${allButtons.length} total):`);
          
          for (let i = 0; i < Math.min(allButtons.length, 15); i++) {
            const text = await allButtons[i].textContent();
            const isVisible = await allButtons[i].isVisible();
            console.log(`   ${i + 1}. "${text?.trim()}" (visible: ${isVisible})`);
          }
        }
      }
    }
  }
}); 