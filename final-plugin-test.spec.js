const { test, expect } = require('@playwright/test');

test('Final Plugin Test', async ({ page }) => {
  console.log('🎯 Final test for Smart Component Filter Plugin...');
  
  // Login to Strapi
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(3000);
  
  // Login with correct credentials
  console.log('📝 Logging in...');
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  
  console.log('✅ Logged in successfully');
  await page.screenshot({ path: 'final-dashboard.png' });
  
  // Navigate to Content-Type Builder
  console.log('🏗️ Navigating to Content-Type Builder...');
  await page.click('text=Content-Type Builder');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'final-ctb.png' });
  
  // Click on first Listing Type element
  console.log('📝 Clicking on Listing Type...');
  await page.locator('text=Listing Type').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'final-listing-type.png' });
  
  // Click Add field button
  console.log('➕ Clicking Add field...');
  await page.click('button:has-text("Add field")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'final-add-field.png' });
  
  // Check for CUSTOM FIELDS section
  const pageContent = await page.textContent('body');
  console.log('📄 Checking page content...');
  
  if (pageContent.includes('CUSTOM FIELDS')) {
    console.log('🎯 CUSTOM FIELDS section found!');
    
    if (pageContent.includes('Component Multi-Select')) {
      console.log('🎉 SUCCESS! Component Multi-Select custom field found!');
      await page.screenshot({ path: 'final-success.png' });
      
      // Try to click the custom field
      const customField = page.locator('text=Component Multi-Select');
      if (await customField.isVisible()) {
        console.log('🔥 Clicking Component Multi-Select...');
        await customField.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'final-custom-field-form.png' });
        
        // Fill field name
        const nameInput = page.locator('input[name="name"]');
        if (await nameInput.isVisible()) {
          console.log('📝 Filling field name...');
          await nameInput.fill('TestComponentField');
          await page.waitForTimeout(1000);
          
          // Click Add Field button
          const addButton = page.locator('button:has-text("Add Field")');
          if (await addButton.isVisible()) {
            console.log('✅ Adding custom field...');
            await addButton.click();
            await page.waitForTimeout(3000);
            await page.screenshot({ path: 'final-field-added.png' });
            
            console.log('🎊 PLUGIN TEST SUCCESSFUL! Custom field added!');
          }
        }
      }
    } else {
      console.log('❌ Component Multi-Select not found');
      console.log('Available content:', pageContent.substring(pageContent.indexOf('CUSTOM FIELDS'), pageContent.indexOf('CUSTOM FIELDS') + 500));
    }
  } else {
    console.log('❌ CUSTOM FIELDS section not found');
    console.log('Page content preview:', pageContent.substring(0, 1000));
  }
  
  console.log('🏁 Final test completed!');
}); 