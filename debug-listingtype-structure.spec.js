const { test } = require('@playwright/test');

test('debug ListingType structure', async ({ page }) => {
  console.log('🔍 Debug ListingType structure...');
  
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
  
  // Find ListingType label
  console.log('🔍 Looking for ListingType label...');
  const listingTypeLabel = page.locator('label:has-text("ListingType")').first();
  
  if (await listingTypeLabel.isVisible()) {
    console.log('✅ Found ListingType label');
    
    // Get the parent container
    const parentContainer = listingTypeLabel.locator('xpath=..').first();
    const grandParentContainer = listingTypeLabel.locator('xpath=../..').first();
    
    console.log('🔍 Analyzing parent container...');
    
    // Look for all interactive elements in parent containers
    const buttons = await parentContainer.locator('button').count();
    const inputs = await parentContainer.locator('input').count();
    const comboboxes = await parentContainer.locator('[role="combobox"]').count();
    const selects = await parentContainer.locator('select').count();
    
    console.log(`📊 In parent container:`);
    console.log(`   - buttons: ${buttons}`);
    console.log(`   - inputs: ${inputs}`);
    console.log(`   - comboboxes: ${comboboxes}`);
    console.log(`   - selects: ${selects}`);
    
    // Check grandparent container
    const gpButtons = await grandParentContainer.locator('button').count();
    const gpInputs = await grandParentContainer.locator('input').count();
    const gpComboboxes = await grandParentContainer.locator('[role="combobox"]').count();
    const gpSelects = await grandParentContainer.locator('select').count();
    
    console.log(`📊 In grandparent container:`);
    console.log(`   - buttons: ${gpButtons}`);
    console.log(`   - inputs: ${gpInputs}`);
    console.log(`   - comboboxes: ${gpComboboxes}`);
    console.log(`   - selects: ${gpSelects}`);
    
    // Try to find any clickable element near the label
    if (gpButtons > 0) {
      console.log('🔍 Checking buttons in grandparent...');
      const buttonElements = await grandParentContainer.locator('button').all();
      
      for (let i = 0; i < buttonElements.length; i++) {
        const buttonText = await buttonElements[i].textContent();
        const placeholder = await buttonElements[i].getAttribute('placeholder');
        console.log(`   Button ${i + 1}: text="${buttonText}", placeholder="${placeholder}"`);
        
        // If button has placeholder "Add or create a relation", this might be our field
        if (placeholder === 'Add or create a relation' || buttonText?.includes('Add or create')) {
          console.log('✅ Found potential ListingType button!');
          
          // Try clicking it
          await buttonElements[i].click();
          await page.waitForTimeout(2000);
          
          // Check if dropdown opened
          const dropdown = page.locator('[role="listbox"], [role="menu"], .dropdown, [data-testid*="dropdown"]').first();
          if (await dropdown.isVisible()) {
            console.log('✅ Dropdown opened!');
            
            // Look for Bank option
            const bankOption = page.locator('text=Bank').first();
            if (await bankOption.isVisible()) {
              console.log('✅ Found Bank option - this is the ListingType field!');
              await bankOption.click();
              await page.waitForTimeout(3000);
              
              console.log('✅ Selected Bank');
              
              // Now test Dynamic Zone
              const dzButton = page.locator('button:has-text("Add a component to FieldGroup")').first();
              if (await dzButton.isVisible()) {
                console.log('✅ Found Dynamic Zone button');
                await dzButton.click();
                await page.waitForTimeout(2000);
                
                const dialog = page.locator('[role="dialog"]').first();
                if (await dialog.isVisible()) {
                  console.log('✅ Component picker opened');
                  
                  // Count components
                  const allComponents = await dialog.locator('button').count();
                  console.log(`🔍 Total components: ${allComponents}`);
                  
                  // Check categories
                  const contactCount = await dialog.locator('text=contact').count();
                  const violationCount = await dialog.locator('text=violation').count();
                  
                  console.log(`📊 contact: ${contactCount}, violation: ${violationCount}`);
                  
                  if (contactCount > 0 && violationCount === 0) {
                    console.log('🎉 SUCCESS: Smart loading working!');
                  } else if (violationCount > 0) {
                    console.log('❌ FAILED: Smart loading not working');
                  }
                  
                  await page.screenshot({ path: 'debug-listingtype-structure.png' });
                }
              }
              
              break;
            } else {
              console.log('❌ Bank option not found in dropdown');
            }
          } else {
            console.log('❌ Dropdown not opened');
          }
        }
      }
    }
  } else {
    console.log('❌ ListingType label not found');
  }
}); 