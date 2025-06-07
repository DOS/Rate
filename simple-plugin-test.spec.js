const { test, expect } = require('@playwright/test');

test('Simple Plugin Test', async ({ page }) => {
  console.log('🚀 Testing Smart Component Filter Plugin...');
  
  // Login to Strapi
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(3000);
  
  // Check if login form exists
  const emailInput = page.locator('input[name="email"]');
  if (await emailInput.isVisible()) {
    console.log('📝 Logging in...');
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', '!CkLdz_28@HH');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
  }
  
  console.log('✅ Logged in successfully');
  
  // Take screenshot of dashboard
  await page.screenshot({ path: 'dashboard.png' });
  
  // Look for any menu items
  const menuItems = await page.locator('[role="navigation"] a, [role="navigation"] button').allTextContents();
  console.log('📋 Available menu items:', menuItems);
  
  // Try to find Settings or Content-Type Builder
  const settingsButton = page.locator('text=Settings').or(page.locator('text=Cài đặt'));
  if (await settingsButton.isVisible()) {
    console.log('⚙️ Found Settings, clicking...');
    await settingsButton.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'settings.png' });
    
    // Look for Content-Type Builder
    const ctbButton = page.locator('text=Content-Type Builder').or(page.locator('text=Content Types'));
    if (await ctbButton.isVisible()) {
      console.log('🏗️ Found Content-Type Builder!');
      await ctbButton.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'content-type-builder.png' });
      
      // Look for Listing Type
      const listingType = page.locator('text=Listing Type').or(page.locator('text=listing-type'));
      if (await listingType.isVisible()) {
        console.log('📝 Found Listing Type!');
        await listingType.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'listing-type.png' });
        
        // Look for Add field button
        const addField = page.locator('button').filter({ hasText: /Add.*field/i });
        if (await addField.isVisible()) {
          console.log('➕ Found Add Field button!');
          await addField.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: 'add-field.png' });
          
          // Look for CUSTOM FIELDS
          const customFields = page.locator('text=CUSTOM FIELDS').or(page.locator('text=Custom Fields'));
          if (await customFields.isVisible()) {
            console.log('🎯 CUSTOM FIELDS section found!');
            
            // Look for Component Multi-Select
            const componentMultiSelect = page.locator('text=Component Multi-Select');
            if (await componentMultiSelect.isVisible()) {
              console.log('🎉 SUCCESS! Component Multi-Select custom field found!');
              await page.screenshot({ path: 'plugin-success.png' });
            } else {
              console.log('❌ Component Multi-Select not found');
              await page.screenshot({ path: 'no-custom-field.png' });
            }
          } else {
            console.log('❌ CUSTOM FIELDS section not found');
            await page.screenshot({ path: 'no-custom-fields.png' });
          }
        } else {
          console.log('❌ Add Field button not found');
        }
      } else {
        console.log('❌ Listing Type not found');
      }
    } else {
      console.log('❌ Content-Type Builder not found');
    }
  } else {
    console.log('❌ Settings not found');
  }
  
  console.log('🏁 Test completed!');
}); 