const { test, expect } = require('@playwright/test');

test('Explore Page Structure to Find ListingType', async ({ page }) => {
  console.log('🚀 Starting page structure exploration...');
  
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
  
  console.log('🔍 Exploring page structure...');
  
  // Take full page screenshot
  await page.screenshot({ path: 'explore-full-page.png', fullPage: true });
  console.log('📸 Full page screenshot saved');
  
  // Find all form fields
  console.log('📋 All input fields:');
  const allInputs = await page.locator('input').all();
  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    const name = await input.getAttribute('name');
    const placeholder = await input.getAttribute('placeholder');
    const type = await input.getAttribute('type');
    const value = await input.inputValue();
    console.log(`Input ${i}: name="${name}", placeholder="${placeholder}", type="${type}", value="${value}"`);
  }
  
  // Find all comboboxes
  console.log('📋 All comboboxes:');
  const allComboboxes = await page.locator('[role="combobox"]').all();
  for (let i = 0; i < allComboboxes.length; i++) {
    const combobox = allComboboxes[i];
    const text = await combobox.textContent();
    const ariaLabel = await combobox.getAttribute('aria-label');
    const id = await combobox.getAttribute('id');
    console.log(`Combobox ${i}: text="${text}", aria-label="${ariaLabel}", id="${id}"`);
  }
  
  // Find all data-strapi-field-name attributes
  console.log('📋 All Strapi fields:');
  const allStrapiFields = await page.locator('[data-strapi-field-name]').all();
  for (let i = 0; i < allStrapiFields.length; i++) {
    const field = allStrapiFields[i];
    const fieldName = await field.getAttribute('data-strapi-field-name');
    const tagName = await field.evaluate(el => el.tagName);
    console.log(`Strapi field ${i}: name="${fieldName}", tag="${tagName}"`);
  }
  
  // Look for text containing "ListingType" or "Listing Type"
  console.log('📋 Elements containing "ListingType":');
  const listingTypeElements = await page.locator('text=/.*[Ll]isting.*[Tt]ype.*/').all();
  for (let i = 0; i < listingTypeElements.length; i++) {
    const element = listingTypeElements[i];
    const text = await element.textContent();
    const tagName = await element.evaluate(el => el.tagName);
    console.log(`ListingType element ${i}: text="${text}", tag="${tagName}"`);
  }
  
  // Look for any select elements
  console.log('📋 All select elements:');
  const allSelects = await page.locator('select').all();
  for (let i = 0; i < allSelects.length; i++) {
    const select = allSelects[i];
    const name = await select.getAttribute('name');
    const id = await select.getAttribute('id');
    console.log(`Select ${i}: name="${name}", id="${id}"`);
  }
  
  // Look for buttons that might open dropdowns
  console.log('📋 Buttons that might be dropdowns:');
  const dropdownButtons = await page.locator('button[aria-expanded], button[aria-haspopup]').all();
  for (let i = 0; i < dropdownButtons.length; i++) {
    const button = dropdownButtons[i];
    const text = await button.textContent();
    const ariaExpanded = await button.getAttribute('aria-expanded');
    const ariaHaspopup = await button.getAttribute('aria-haspopup');
    console.log(`Dropdown button ${i}: text="${text}", expanded="${ariaExpanded}", haspopup="${ariaHaspopup}"`);
  }
  
  // Try to find and click any dropdown that might be ListingType
  console.log('🎯 Trying to find ListingType dropdown...');
  
  // Look for buttons with "Select" or empty text that might be dropdowns
  const possibleDropdowns = await page.locator('button:has-text("Select"), button:has-text("Choose"), button[aria-haspopup="listbox"]').all();
  for (let i = 0; i < possibleDropdowns.length; i++) {
    const dropdown = possibleDropdowns[i];
    const text = await dropdown.textContent();
    console.log(`Possible dropdown ${i}: "${text}"`);
    
    // Try clicking it to see if it opens ListingType options
    try {
      await dropdown.click();
      await page.waitForTimeout(1000);
      
      // Check if Bank/Scammer options appear
      const bankOption = page.locator('text="Bank"');
      const scammerOption = page.locator('text="Scammer"');
      
      if (await bankOption.isVisible() || await scammerOption.isVisible()) {
        console.log(`🎉 Found ListingType dropdown at index ${i}!`);
        
        // Take screenshot of opened dropdown
        await page.screenshot({ path: `explore-dropdown-${i}.png`, fullPage: true });
        
        // Try selecting Bank
        if (await bankOption.isVisible()) {
          await bankOption.click();
          console.log('✅ Selected Bank');
          await page.waitForTimeout(2000);
          
          // Now try to open component picker
          const addComponentButton = page.locator('button:has-text("Add a component")').first();
          if (await addComponentButton.isVisible()) {
            await addComponentButton.click();
            await page.waitForTimeout(2000);
            console.log('✅ Component picker opened');
            
            // Take screenshot
            await page.screenshot({ path: 'explore-component-picker-opened.png', fullPage: true });
            
            // Now try to change back to ListingType while picker is open
            console.log('🎯 Trying to change ListingType while picker is open...');
            
            // Click the same dropdown again
            await dropdown.click();
            await page.waitForTimeout(1000);
            
            if (await scammerOption.isVisible()) {
              await scammerOption.click();
              console.log('✅ Selected Scammer while picker is open');
              await page.waitForTimeout(3000);
              
              // Take final screenshot
              await page.screenshot({ path: 'explore-after-scammer-change.png', fullPage: true });
            }
          }
        }
        break;
      } else {
        // Click somewhere else to close dropdown
        await page.click('body', { position: { x: 100, y: 100 } });
        await page.waitForTimeout(500);
      }
    } catch (error) {
      console.log(`Error clicking dropdown ${i}: ${error.message}`);
    }
  }
  
  console.log('✅ Page exploration completed');
}); 